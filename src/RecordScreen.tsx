import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
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

type Props = {
  lang: string;
  isNightMode: boolean;
  onSaved: (id: string) => void;
  onCancel: () => void;
};

function fmt(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
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
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [title, setTitle] = useState(
    "Lecture " + new Date().toLocaleDateString()
  );

  const wantRecording = useRef(false);
  const finalRef = useRef("");
  const scrollRef = useRef<ScrollView>(null);

  // timer
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  // stop the engine if the screen closes
  useEffect(() => {
    return () => {
      wantRecording.current = false;
      ExpoSpeechRecognitionModule.abort();
    };
  }, []);

  const startEngine = () =>
    ExpoSpeechRecognitionModule.start({
      lang,
      interimResults: true,
      continuous: true,
      addsPunctuation: true,
    });

  useSpeechRecognitionEvent("result", (e) => {
    const t = e.results[0]?.transcript ?? "";
    if (e.isFinal) {
      finalRef.current = (finalRef.current + " " + t).trim();
      setFinalText(finalRef.current);
      setInterim("");
    } else {
      setInterim(t);
    }
    scrollRef.current?.scrollToEnd({ animated: true });
  });

  useSpeechRecognitionEvent("end", () => {
    // the engine often stops on its own after silence; restart if the user hasn't pressed stop
    if (wantRecording.current) startEngine();
    else setRecording(false);
  });

  useSpeechRecognitionEvent("error", (e) => {
    // silence is normal; "end" will fire next and restart
    if (e.error === "no-speech" || e.error === "speech-timeout") return;
    wantRecording.current = false;
    setRecording(false);
    Alert.alert("Speech recognition error", `${e.error}: ${e.message}`);
  });

  const begin = async () => {
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Permission needed",
        "Allow microphone and speech recognition in your phone settings."
      );
      return;
    }
    wantRecording.current = true;
    setRecording(true);
    startEngine();
  };

  const stop = () => {
    wantRecording.current = false;
    ExpoSpeechRecognitionModule.stop();
    setRecording(false);
  };

  const save = async () => {
    stop();
    const text = (finalRef.current + " " + interim).trim();
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
  };

  const cancel = () => {
    if (!finalText && !interim) return onCancel();
    Alert.alert("Discard this recording?", "The transcript has not been saved.", [
      { text: "Keep recording", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: onCancel },
    ]);
  };

  return (
    <View style={s.container}>
      <TextInput
        style={s.title}
        value={title}
        onChangeText={setTitle}
        placeholder="Lecture title"
        placeholderTextColor={c.subtle}
      />
      <Text style={s.meta}>
        {recording ? "● Recording" : "Paused"}  ·  {fmt(seconds)}  ·  {lang}
      </Text>

      <ScrollView ref={scrollRef} style={s.box}>
        <Text style={s.transcript}>
          {finalText}
          {interim ? <Text style={s.interim}> {interim}</Text> : null}
          {!finalText && !interim ? (
            <Text style={s.interim}>Press Start and begin speaking…</Text>
          ) : null}
        </Text>
      </ScrollView>

      <View style={s.row}>
        <TouchableOpacity style={[s.btn, s.grey]} onPress={cancel}>
          <Text style={s.btnText}>Cancel</Text>
        </TouchableOpacity>
        {recording ? (
          <TouchableOpacity style={[s.btn, s.red]} onPress={stop}>
            <Text style={s.btnText}>Pause</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[s.btn, s.primary]} onPress={begin}>
            <Text style={s.btnText}>{seconds ? "Resume" : "Start"}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[s.btn, s.blue]} onPress={save}>
          <Text style={s.btnText}>Save</Text>
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
  row: { flexDirection: "row", gap: 10, marginTop: 14 },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  grey: { backgroundColor: "#5f6368" },
  red: { backgroundColor: "#b3261e" },
  primary: { backgroundColor: c.accent },
  blue: { backgroundColor: c.accent },
  });
}