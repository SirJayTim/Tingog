import type { DocumentPickerAsset } from "./documentPicker";
import { fetch as expoFetch } from "expo/fetch";
import { File } from "expo-file-system";

export type TranscriptionLanguage = "eng" | "tgl" | "hil";

export const TRANSCRIPTION_LANGUAGES: {
  code: TranscriptionLanguage;
  label: string;
  detail: string;
}[] = [
  { code: "eng", label: "English", detail: "English" },
  { code: "tgl", label: "Tagalog", detail: "Filipino" },
  { code: "hil", label: "Hiligaynon", detail: "Ilonggo" },
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

export async function transcribeAudio(
  asset: DocumentPickerAsset,
  language: TranscriptionLanguage
): Promise<TranscriptionResult> {
  const baseUrl = process.env.EXPO_PUBLIC_TRANSCRIPTION_API_URL?.trim();
  if (!baseUrl) {
    throw new Error(
      "Transcription is not configured. Set EXPO_PUBLIC_TRANSCRIPTION_API_URL and restart Expo."
    );
  }

  const form = new FormData();
  const audioFile = asset.file ?? new File(asset.uri);
  form.append("file", audioFile, asset.name);
  form.append("language", language);

  const response = await expoFetch(
    `${baseUrl.replace(/\/+$/, "")}/transcribe`,
    { method: "POST", body: form }
  );
  const body = await response.text();
  let data: TranscriptionResponse;
  try {
    data = JSON.parse(body) as TranscriptionResponse;
  } catch {
    throw new Error(
      response.ok
        ? "The transcription server returned an invalid response."
        : `Transcription failed (${response.status}). ${body.slice(0, 240)}`
    );
  }

  if (!response.ok) {
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : typeof data.text === "string"
          ? data.text
          : `HTTP ${response.status}`;
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
