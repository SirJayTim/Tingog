import type { DocumentPickerAsset } from "./documentPicker";
import {
  uploadAsync,
  FileSystemUploadType,
} from "expo-file-system/legacy";
import Constants from "expo-constants";
import { loadApiUrl, saveApiUrl } from "./storage";

export const DEFAULT_TRANSCRIPTION_API_URL = "http://localhost:8000";

function normalizeApiUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function developmentHostIpv4(): string {
  if (!__DEV__) return "";

  const hostUri = Constants.expoConfig?.hostUri?.trim() ?? "";
  const match =
    /^(?:[a-z][a-z\d+.-]*:\/\/)?(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?(?:\/|$)/i.exec(
      hostUri
    );
  if (!match) return "";

  const octets = match[1].split(".").map(Number);
  return octets.every((octet) => octet <= 255) ? match[1] : "";
}

function resolveDevelopmentHost(url: string): string {
  const host = developmentHostIpv4();
  if (!host) return url;

  const parsed = /^(https?:\/\/)([^/?#]+)(.*)$/i.exec(url);
  if (!parsed) return url;

  const authority = parsed[2];
  const credentialsEnd = authority.lastIndexOf("@");
  const credentials =
    credentialsEnd >= 0 ? authority.slice(0, credentialsEnd + 1) : "";
  const hostAndPort =
    credentialsEnd >= 0 ? authority.slice(credentialsEnd + 1) : authority;
  const port = /:\d+$/.exec(hostAndPort)?.[0] ?? "";

  return `${parsed[1]}${credentials}${host}${port}${parsed[3]}`;
}

function bundledEnvUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_TRANSCRIPTION_API_URL?.trim() ?? "";
  if (!fromEnv) return "";
  return normalizeApiUrl(fromEnv);
}

export async function getTranscriptionApiUrl(): Promise<string> {
  const saved = normalizeApiUrl(await loadApiUrl());
  const configuredUrl = saved || bundledEnvUrl() || DEFAULT_TRANSCRIPTION_API_URL;
  return resolveDevelopmentHost(configuredUrl);
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

function extractDetail(status: number, data: TranscriptionResponse): string {
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.detail)) return JSON.stringify(data.detail);
  if (typeof data.text === "string") return data.text;
  return "HTTP " + status;
}

async function uploadAudio(
  endpoint: string,
  asset: DocumentPickerAsset,
  language: TranscriptionLanguage
): Promise<TranscriptionResponse> {
  const mime = asset.mimeType || mimeTypeForName(asset.name || "");
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
      "Could not reach " +
        endpoint +
        ". The API must be running on this PC at that Wi-Fi IP, and the phone must be on the same Wi-Fi. " +
        reason
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
        : "Transcription failed (" + uploadResult.status + "). " + body.slice(0, 240)
    );
  }

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(
      "Transcription failed: " + extractDetail(uploadResult.status, data)
    );
  }
  return data;
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

  const endpoint = baseUrl + "/transcribe";

  const data = await uploadAudio(endpoint, asset, language);
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
    const name = uri.split("/").pop() || "recording-" + (index + 1) + ".wav";
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