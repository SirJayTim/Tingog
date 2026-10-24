import io
import os
import subprocess
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
LANGUAGES = {"eng", "tgl", "hil"}

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
    allow_origins=os.environ.get(
        "CORS_ORIGINS", "http://localhost:8081"
    ).split(","),
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ready": model is not None and processor is not None}


def decode_audio(audio_bytes: bytes) -> np.ndarray:
    try:
        result = subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                "pipe:0",
                "-f",
                "wav",
                "-ac",
                "1",
                "-ar",
                "16000",
                "pipe:1",
            ],
            input=audio_bytes,
            capture_output=True,
            check=False,
            timeout=180,
        )
    except FileNotFoundError as error:
        raise HTTPException(
            status_code=503, detail="FFmpeg is not installed on the transcription server."
        ) from error
    except subprocess.TimeoutExpired as error:
        raise HTTPException(
            status_code=422, detail="Audio conversion timed out."
        ) from error

    if result.returncode != 0:
        raise HTTPException(
            status_code=422, detail="The uploaded file could not be decoded as audio."
        )

    try:
        samples, sample_rate = sf.read(io.BytesIO(result.stdout), dtype="float32")
    except (RuntimeError, ValueError) as error:
        raise HTTPException(
            status_code=422, detail="The uploaded file contains invalid audio data."
        ) from error

    if sample_rate != 16000 or samples.ndim != 1 or samples.size == 0:
        raise HTTPException(status_code=422, detail="No usable audio was found.")
    return samples


def transcribe_chunks(samples: np.ndarray, language: str) -> str:
    if model is None or processor is None:
        raise HTTPException(
            status_code=503, detail="The transcription model is still loading."
        )

    processor.tokenizer.set_target_lang(language)
    model.load_adapter(language)

    parts: list[str] = []
    chunk_samples = CHUNK_SECONDS * 16000
    with torch.inference_mode():
        for start in range(0, samples.size, chunk_samples):
            inputs = processor(
                samples[start : start + chunk_samples],
                sampling_rate=16000,
                return_tensors="pt",
            )
            inputs = {key: value.to(device) for key, value in inputs.items()}
            logits = model(**inputs).logits
            token_ids = torch.argmax(logits, dim=-1)[0]
            part = processor.decode(token_ids).strip()
            if part:
                parts.append(part)
    return " ".join(parts)


@app.post("/transcribe")
def transcribe(
    file: UploadFile = File(...),
    language: Literal["eng", "tgl", "hil"] = Form(...),
):
    if language not in LANGUAGES:
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
