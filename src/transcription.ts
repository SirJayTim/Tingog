import type { DocumentPickerAsset } from "./documentPicker";
import {
  uploadAsync,
  FileSystemUploadType,
} from "expo-file-system/legacy";
import { loadApiUrl, saveApiUrl } from "./storage";

export const DEFAULT_TRANSCRIPTION_API_URL = "http://192.168.1.11:8000";

function normalizeApiUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function bundledEnvUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_TRANSCRIPTION_API_URL?.trim() ?? "";
  if (!fromEnv) return "";
  // Metro inlines this at start. Ignore a stale LAN IP that is not this PC.
  if (fromEnv.includes("172.16.25.197")) return "";
  return normalizeApiUrl(fromEnv);
}

export async function getTranscriptionApiUrl(): Promise<string> {
  const saved = normalizeApiUrl(await loadApiUrl());
  if (saved && !saved.includes("172.16.25.197")) return saved;
  return bundledEnvUrl() || DEFAULT_TRANSCRIPTION_API_URL;
}

export async function setTranscriptionApiUrl(url: string): Promise<string> {
  const normalized = normalizeApiUrl(url) || DEFAULT_TRANSCRIPTION_API_URL;
  await saveApiUrl(normalized);
  return normalized;
}

export type TranscriptionLanguage = "mix" | "eng" | "tgl" | "hil";

export const TRANSCRIPTION_LANGUAGES: {
  code: TranscriptionLanguage;
  label: string;
  detail: string;
  speechLocale: string;
}[] = [
  {
    code: "mix",
    label: "Mixed",
    detail: "English, Tagalog, Hiligaynon",
    speechLocale: "fil-PH",
  },
  { code: "eng", label: "English", detail: "English", speechLocale: "en-US" },
  { code: "tgl", label: "Tagalog", detail: "Filipino", speechLocale: "fil-PH" },
  {
    code: "hil",
    label: "Hiligaynon",
    detail: "Ilonggo",
    speechLocale: "fil-PH",
  },
];

export type TranscriptionResult = {
  text: string;
  durationSec: number;
};

type TranscriptionResponse = {
  text?: unknown;
  detail?: unknown;
  duration_seconds?: unknown;
};

export function isTranscriptionLanguage(
  value: string
): value is TranscriptionLanguage {
  return TRANSCRIPTION_LANGUAGES.some((item) => item.code === value);
}

export function normalizeTranscriptionLanguage(
  value: string
): TranscriptionLanguage {
  if (isTranscriptionLanguage(value)) return value;
  const lower = value.toLowerCase();
  if (lower.startsWith("en")) return "eng";
  if (lower.startsWith("hil") || lower.startsWith("ilo")) return "hil";
  if (
    lower.startsWith("fil") ||
    lower.startsWith("tl") ||
    lower.startsWith("tgl") ||
    lower.startsWith("tag")
  ) {
    return "tgl";
  }
  return "mix";
}

export function transcriptionLanguageLabel(value: string): string {
  const code = normalizeTranscriptionLanguage(value);
  return (
    TRANSCRIPTION_LANGUAGES.find((item) => item.code === code)?.label ?? value
  );
}

export function speechLocaleFor(language: TranscriptionLanguage): string {
  return (
    TRANSCRIPTION_LANGUAGES.find((item) => item.code === language)
      ?.speechLocale ?? "fil-PH"
  );
}

function mimeTypeForName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "mp3":
      return "audio/mpeg";
    case "m4a":
      return "audio/mp4";
    case "wav":
    case "wave":
      return "audio/wav";
    case "ogg":
      return "audio/ogg";
    case "flac":
      return "audio/flac";
    case "aac":
      return "audio/aac";
    case "webm":
      return "audio/webm";
    default:
      return "application/octet-stream";
  }
}

export async function transcribeAudio(
  asset: DocumentPickerAsset,
  language: TranscriptionLanguage
): Promise<TranscriptionResult> {
  const baseUrl = await getTranscriptionApiUrl();
  if (!baseUrl) {
    throw new Error(
      "Transcription is not configured. Enter the API URL on the import screen."
    );
  }

  const endpoint = `${baseUrl}/transcribe`;
  const mime = asset.mimeType || mimeTypeForName(asset.name || "");

  // Upload the file natively from disk as multipart/form-data.
  // This avoids Blob/FormData incompatibilities entirely — the file bytes
  // reach the server exactly as they exist on disk.
  let uploadResult: { status: number; body: string };
  try {
    uploadResult = await uploadAsync(endpoint, asset.uri, {
      httpMethod: "POST",
      uploadType: FileSystemUploadType.MULTIPART,
      fieldName: "file", // must match the FastAPI parameter name
      mimeType: mime,
      parameters: { language }, // extra form fields
    });
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Network request failed.";
    throw new Error(
      `Could not reach ${endpoint}. The API must be running on this PC at that Wi‑Fi IP, and the phone must be on the same Wi‑Fi. ${reason}`
    );
  }

  const body = typeof uploadResult.body === "string" ? uploadResult.body : "";
  let data: TranscriptionResponse;
  try {
    data = JSON.parse(body) as TranscriptionResponse;
  } catch {
    throw new Error(
      uploadResult.status >= 200 && uploadResult.status < 300
        ? "The transcription server returned an invalid response."
        : `Transcription failed (${uploadResult.status}). ${body.slice(0, 240)}`
    );
  }

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    // FastAPI validation errors come as an array: [{loc, msg, type}, ...]
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : Array.isArray(data.detail)
          ? JSON.stringify(data.detail)
          : typeof data.text === "string"
            ? data.text
            : `HTTP ${uploadResult.status}`;
    throw new Error(`Transcription failed: ${detail}`);
  }
  if (typeof data.text !== "string" || !data.text.trim()) {
    throw new Error("The transcription server returned no transcript.");
  }

  const durationSec =
    typeof data.duration_seconds === "number" &&
    Number.isFinite(data.duration_seconds) &&
    data.duration_seconds > 0
      ? Math.round(data.duration_seconds)
      : 0;

  return { text: data.text.trim(), durationSec };
}

export async function transcribeAudioUris(
  uris: string[],
  language: TranscriptionLanguage
): Promise<TranscriptionResult> {
  const parts: string[] = [];
  let durationSec = 0;
  for (const [index, uri] of uris.entries()) {
    const name = uri.split("/").pop() || `recording-${index + 1}.wav`;
    const result = await transcribeAudio({ uri, name }, language);
    if (result.text) parts.push(result.text);
    durationSec += result.durationSec;
  }
  const text = parts.join(" ").trim();
  if (!text) {
    throw new Error("The transcription server returned no transcript.");
  }
  return { text, durationSec };
}