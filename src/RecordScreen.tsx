import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { newId, upsertLecture } from "./storage";
import { getTheme, type ThemeColors } from "./theme";
import {
  getTranscriptionApiUrl,
  speechLocaleFor,
  transcriptionLanguageLabel,
  transcribeAudioUris,
  type TranscriptionLanguage,
} from "./transcription";

type Props = {
  lang: TranscriptionLanguage;
  isNightMode: boolean;
  onSaved: (id: string) => void;
  onCancel: () => void;
};

function fmt(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function joinTranscript(...parts: string[]) {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

export default function RecordScreen({
  lang,
  isNightMode,
  onSaved,
  onCancel,
}: Props) {
  const c = getTheme(isNightMode);
  const s = useMemo(
    () => createStyles(getTheme(isNightMode)),
    [isNightMode]
  );
  const [recording, setRecording] = useState(false);
  const [confirmedText, setConfirmedText] = useState("");
  const [draftText, setDraftText] = useState("");
  const [interim, setInterim] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [title, setTitle] = useState(
    "Lecture " + new Date().toLocaleDateString()
  );

  const wantRecording = useRef(false);
  const persistEnabled = useRef(false);
  const draftRef = useRef("");
  const confirmedRef = useRef("");
  const pendingUris = useRef<string[]>([]);
  const audioEndWaiters = useRef<(() => void)[]>([]);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  useEffect(() => {
    return () => {
      wantRecording.current = false;
      ExpoSpeechRecognitionModule.abort();
    };
  }, []);

  const startEngine = () => {
    const options: Parameters<typeof ExpoSpeechRecognitionModule.start>[0] = {
      lang: speechLocaleFor(lang),
      interimResults: true,
      continuous: true,
      addsPunctuation: true,
    };
    if (persistEnabled.current) {
      options.recordingOptions = {
        persist: true,
        outputFileName: `tingog-${Date.now()}.wav`,
        outputSampleRate: 16000,
        outputEncoding: "pcmFormatInt16",
      };
    }
    ExpoSpeechRecognitionModule.start(options);
  };

  useSpeechRecognitionEvent("result", (e) => {
    const t = e.results[0]?.transcript ?? "";
    if (e.isFinal) {
      draftRef.current = joinTranscript(draftRef.current, t);
      setDraftText(draftRef.current);
      setInterim("");
    } else {
      setInterim(t);
    }
    scrollRef.current?.scrollToEnd({ animated: true });
  });

  useSpeechRecognitionEvent("audioend", (e) => {
    if (e.uri) pendingUris.current.push(e.uri);
    const waiters = audioEndWaiters.current.splice(0);
    waiters.forEach((resolve) => resolve());
  });

  useSpeechRecognitionEvent("end", () => {
    if (wantRecording.current) startEngine();
    else setRecording(false);
  });

  useSpeechRecognitionEvent("error", (e) => {
    if (e.error === "no-speech" || e.error === "speech-timeout") return;
    wantRecording.current = false;
    setRecording(false);
    Alert.alert("Speech recognition error", `${e.error}: ${e.message}`);
  });

  const begin = async () => {
    if (Platform.OS !== "web") {
      const perm =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission needed",
          "Allow microphone and speech recognition in your phone settings."
        );
        return;
      }
    }
    persistEnabled.current =
      Platform.OS !== "web" &&
      ExpoSpeechRecognitionModule.supportsRecording();
    if (
      persistEnabled.current &&
      !(await getTranscriptionApiUrl())
    ) {
      Alert.alert(
        "Transcription server not configured",
        "Live captions will use the device speech service. Set EXPO_PUBLIC_TRANSCRIPTION_API_URL so recordings can include English, Tagalog, and Hiligaynon words."
      );
    }
    wantRecording.current = true;
    setRecording(true);
    setStatus("");
    startEngine();
  };

  const waitForAudioFile = () =>
    new Promise<void>((resolve) => {
      if (!persistEnabled.current) {
        resolve();
        return;
      }
      const timeout = setTimeout(resolve, 2000);
      audioEndWaiters.current.push(() => {
        clearTimeout(timeout);
        resolve();
      });
    });

  const transcribePendingAudio = async () => {
    const uris = pendingUris.current.splice(0);
    if (!uris.length) return;
    setStatus("Transcribing English, Tagalog, and Hiligaynon…");
    const result = await transcribeAudioUris(uris, lang);
    confirmedRef.current = joinTranscript(confirmedRef.current, result.text);
    draftRef.current = "";
    setConfirmedText(confirmedRef.current);
    setDraftText("");
    setInterim("");
    setStatus("");
  };

  const stopEngine = () => {
    wantRecording.current = false;
    ExpoSpeechRecognitionModule.stop();
    setRecording(false);
  };

  const pause = async () => {
    const wasRecording = recording;
    const audioReady = wasRecording ? waitForAudioFile() : Promise.resolve();
    stopEngine();
    setBusy(true);
    try {
      await audioReady;
      await transcribePendingAudio();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `${error.message} Live draft will be kept.`
          : "Server transcription failed. Live draft will be kept."
      );
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const wasRecording = recording;
    const audioReady = wasRecording ? waitForAudioFile() : Promise.resolve();
    stopEngine();
    setBusy(true);
    try {
      try {
        await audioReady;
        await transcribePendingAudio();
      } catch {
        // Keep the live draft if the recording cannot be sent to the server.
      }
      const text = joinTranscript(
        confirmedRef.current,
        draftRef.current,
        interim
      );
      if (!text) {
        Alert.alert("Nothing to save", "No speech was captured yet.");
        return;
      }
      const now = Date.now();
      const id = newId();
      await upsertLecture({
        id,
        title: title.trim() || "Untitled lecture",
        text,
        createdAt: now,
        updatedAt: now,
        durationSec: seconds,
        lang,
      });
      onSaved(id);
    } catch (error) {
      Alert.alert(
        "Could not save",
        error instanceof Error ? error.message : "Transcription failed."
      );
    } finally {
      setBusy(false);
      setStatus("");
    }
  };

  const cancel = () => {
    if (!confirmedText && !draftText && !interim) return onCancel();
    Alert.alert("Discard this recording?", "The transcript has not been saved.", [
      { text: "Keep recording", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: onCancel },
    ]);
  };

  const displayText = joinTranscript(confirmedText, draftText);
  const languageLabel = transcriptionLanguageLabel(lang);

  return (
    <View style={s.container}>
      <TextInput
        style={s.title}
        value={title}
        onChangeText={setTitle}
        placeholder="Lecture title"
        placeholderTextColor={c.subtle}
        editable={!busy}
      />
      <Text style={s.meta}>
        {recording ? "● Recording" : busy ? "Transcribing" : "Paused"}  ·  {fmt(seconds)}  ·  {languageLabel}
      </Text>

      <ScrollView ref={scrollRef} style={s.box}>
        <Text style={s.transcript}>
          {displayText}
          {interim ? <Text style={s.interim}> {interim}</Text> : null}
          {!displayText && !interim ? (
            <Text style={s.interim}>
              Press Start and begin speaking in English, Tagalog, or Hiligaynon…
            </Text>
          ) : null}
        </Text>
      </ScrollView>

      {status ? <Text style={s.status}>{status}</Text> : null}

      <View style={s.row}>
        <TouchableOpacity
          style={[s.btn, s.grey]}
          onPress={cancel}
          disabled={busy}
        >
          <Text style={s.btnText}>Cancel</Text>
        </TouchableOpacity>
        {recording ? (
          <TouchableOpacity
            style={[s.btn, s.red]}
            onPress={pause}
            disabled={busy}
          >
            <Text style={s.btnText}>Pause</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.btn, s.primary]}
            onPress={begin}
            disabled={busy}
          >
            <Text style={s.btnText}>{seconds ? "Resume" : "Start"}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.btn, s.blue, busy && s.disabled]}
          onPress={save}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.btnText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 56, backgroundColor: c.background },
  title: {
    fontSize: 20,
    fontWeight: "600",
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 16,
    color: c.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  meta: { marginVertical: 12, color: c.subtle },
  box: {
    flex: 1,
    backgroundColor: c.surface,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
  },
  transcript: { fontSize: 17, lineHeight: 26, color: c.text },
  interim: { color: c.subtle },
  status: { color: c.muted, fontSize: 12, lineHeight: 18, marginTop: 10 },
  row: { flexDirection: "row", gap: 10, marginTop: 14 },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  grey: { backgroundColor: "#5f6368" },
  red: { backgroundColor: "#b3261e" },
  primary: { backgroundColor: c.accent },
  blue: { backgroundColor: c.accent },
  disabled: { opacity: 0.7 },
  });
}
