import io
import os
import subprocess
import tempfile
import threading
from contextlib import asynccontextmanager
from typing import Literal

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from transformers import AutoProcessor, Wav2Vec2ForCTC

MODEL_ID = "facebook/mms-1b-all"
MAX_UPLOAD_BYTES = 250 * 1024 * 1024
MAX_DURATION_SECONDS = 2 * 60 * 60
CHUNK_SECONDS = 20
LANGUAGES = ("eng", "tgl", "hil")
LanguageCode = Literal["eng", "tgl", "hil", "mix"]

processor: AutoProcessor | None = None
model: Wav2Vec2ForCTC | None = None
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
inference_lock = threading.Lock()


@asynccontextmanager
async def lifespan(_: FastAPI):
    global model, processor
    processor = AutoProcessor.from_pretrained(MODEL_ID)
    model = Wav2Vec2ForCTC.from_pretrained(MODEL_ID).to(device)
    model.eval()
    yield


app = FastAPI(title="Tingog transcription API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ready": model is not None and processor is not None}


def decode_audio(audio_bytes: bytes) -> np.ndarray:
    """
    Convert uploaded audio to 16 kHz mono float32 samples.

    We write the bytes to a temporary file and let ffmpeg read from the file
    rather than from a pipe: container formats like MP4/M4A are not seekable
    over a pipe, which causes ffmpeg to mangle or silently drop the audio
    (observed as "No usable audio was found" for m4a uploads).
    """
    tmp_input: str | None = None
    tmp_output: str | None = None
    try:
        # 1. Persist the upload to a temp file so ffmpeg can seek in it.
        with tempfile.NamedTemporaryFile(delete=False) as handle:
            handle.write(audio_bytes)
            tmp_input = handle.name

        tmp_output = os.path.splitext(tmp_input)[0] + ".wav"

        # 2. Convert to WAV (16 kHz, mono) using the temp file as input.
        try:
            result = subprocess.run(
                [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-y",
                    "-i",
                    tmp_input,
                    "-map",
                    "0:a:0",  # take the first audio stream explicitly
                    "-f",
                    "wav",
                    "-ac",
                    "1",
                    "-ar",
                    "16000",
                    tmp_output,
                ],
                capture_output=True,
                check=False,
                timeout=180,
            )
        except FileNotFoundError as error:
            raise HTTPException(
                status_code=503,
                detail="FFmpeg is not installed on the transcription server.",
            ) from error
        except subprocess.TimeoutExpired as error:
            raise HTTPException(
                status_code=422, detail="Audio conversion timed out."
            ) from error

        if result.returncode != 0:
            raise HTTPException(
                status_code=422,
                detail="The uploaded file could not be decoded as audio.",
            )

        if not os.path.exists(tmp_output) or os.path.getsize(tmp_output) == 0:
            raise HTTPException(
                status_code=422, detail="No usable audio was found."
            )

        # 3. Read the converted WAV.
        try:
            samples, sample_rate = sf.read(tmp_output, dtype="float32")
        except (RuntimeError, ValueError) as error:
            raise HTTPException(
                status_code=422, detail="The uploaded file contains invalid audio data."
            ) from error

        if sample_rate != 16000 or samples.ndim != 1 or samples.size == 0:
            raise HTTPException(status_code=422, detail="No usable audio was found.")
        return samples
    finally:
        # 4. Always clean up the temporary files.
        if tmp_input and os.path.exists(tmp_input):
            os.unlink(tmp_input)
        if tmp_output and os.path.exists(tmp_output):
            os.unlink(tmp_output)


def require_model() -> tuple[AutoProcessor, Wav2Vec2ForCTC]:
    if model is None or processor is None:
        raise HTTPException(
            status_code=503, detail="The transcription model is still loading."
        )
    return processor, model


def score_and_decode(logits: torch.Tensor) -> tuple[str, float]:
    active_processor, _ = require_model()
    token_logits = logits[0]
    probabilities = torch.softmax(token_logits, dim=-1)
    max_probs, token_ids = probabilities.max(dim=-1)
    blank_id = active_processor.tokenizer.pad_token_id
    if blank_id is None:
        blank_id = 0
    spoken = token_ids != blank_id
    score = float(max_probs[spoken].mean()) if bool(spoken.any()) else 0.0
    text = active_processor.decode(token_ids).strip()
    if not text:
        return "", -1.0
    return text, score


def transcribe_language_chunks(
    chunks: list[np.ndarray], language: str
) -> list[tuple[str, float]]:
    active_processor, active_model = require_model()
    active_processor.tokenizer.set_target_lang(language)
    active_model.load_adapter(language)

    results: list[tuple[str, float]] = []
    with torch.inference_mode():
        for chunk in chunks:
            inputs = active_processor(
                chunk,
                sampling_rate=16000,
                return_tensors="pt",
            )
            inputs = {key: value.to(device) for key, value in inputs.items()}
            logits = active_model(**inputs).logits
            results.append(score_and_decode(logits))
    return results


def split_chunks(samples: np.ndarray) -> list[np.ndarray]:
    chunk_samples = CHUNK_SECONDS * 16000
    return [
        samples[start : start + chunk_samples]
        for start in range(0, samples.size, chunk_samples)
    ]


def transcribe_chunks(samples: np.ndarray, language: LanguageCode) -> str:
    chunks = split_chunks(samples)
    if language != "mix":
        return " ".join(
            text for text, _score in transcribe_language_chunks(chunks, language) if text
        )

    by_language = {
        code: transcribe_language_chunks(chunks, code) for code in LANGUAGES
    }
    parts: list[str] = []
    for index in range(len(chunks)):
        best_text, best_score = "", -1.0
        for code in LANGUAGES:
            text, score = by_language[code][index]
            if score > best_score:
                best_text, best_score = text, score
        if best_text:
            parts.append(best_text)
    return " ".join(parts)


@app.post("/transcribe")
def transcribe(
    file: UploadFile = File(...),
    language: LanguageCode = Form("mix"),
):
    if language not in (*LANGUAGES, "mix"):
        raise HTTPException(status_code=422, detail="Unsupported language code.")
    audio_bytes = file.file.read(MAX_UPLOAD_BYTES + 1)
    if not audio_bytes:
        raise HTTPException(status_code=422, detail="The uploaded file is empty.")
    if len(audio_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Audio file exceeds the 250 MB limit.")

    samples = decode_audio(audio_bytes)
    duration_seconds = samples.size / 16000
    if duration_seconds > MAX_DURATION_SECONDS:
        raise HTTPException(status_code=413, detail="Audio exceeds the 2-hour limit.")

    with inference_lock:
        text = transcribe_chunks(samples, language)
    if not text:
        raise HTTPException(status_code=422, detail="No speech was recognized.")

    return {
        "text": text,
        "language": language,
        "duration_seconds": duration_seconds,
    }