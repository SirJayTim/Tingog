import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { getDocumentAsync, type DocumentPickerAsset } from "./documentPicker";
import { newId, upsertLecture } from "./storage";
import {
  TRANSCRIPTION_LANGUAGES,
  TranscriptionLanguage,
  transcribeAudio,
} from "./transcription";
import { getTheme, type ThemeColors } from "./theme";

type Props = {
  isNightMode: boolean;
  onSaved: (id: string) => void;
  onCancel: () => void;
};

function formatBytes(bytes?: number) {
  if (bytes === undefined || bytes < 0) return "Audio file";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TranscribeScreen({
  isNightMode,
  onSaved,
  onCancel,
}: Props) {
  const c = getTheme(isNightMode);
  const s = useMemo(
    () => createStyles(getTheme(isNightMode)),
    [isNightMode]
  );
  const [asset, setAsset] = useState<DocumentPickerAsset>();
  const [language, setLanguage] = useState<TranscriptionLanguage>("hil");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const chooseFile = async () => {
    setError("");
    try {
      const result = await getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;

      const selected = result.assets[0];
      if (!selected) {
        setError("No audio file was selected.");
        return;
      }
      setAsset(selected);
      setTitle((current) => current || selected.name.replace(/\.[^.]+$/, ""));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not open the audio picker."
      );
    }
  };

  const submit = async () => {
    if (!asset) {
      setError("Choose an audio file to continue.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await transcribeAudio(asset, language);
      const now = Date.now();
      const id = newId();
      await upsertLecture({
        id,
        title: title.trim() || asset.name.replace(/\.[^.]+$/, ""),
        text: result.text,
        createdAt: now,
        updatedAt: now,
        durationSec: result.durationSec,
        lang: language,
      });
      onSaved(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    if (busy) {
      Alert.alert(
        "Transcription in progress",
        "Wait for the upload to finish before leaving this screen."
      );
      return;
    }
    onCancel();
  };

  return (
    <View style={s.screen}>
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={cancel} style={s.back} disabled={busy}>
          <Text style={s.backText}>‹  Library</Text>
        </TouchableOpacity>

        <Text style={s.eyebrow}>AUDIO TRANSCRIPTION</Text>
        <Text style={s.heading}>Turn a recording into notes</Text>
        <Text style={s.description}>
          Upload an audio file and choose the main spoken language. Your
          transcript will be saved to this device.
        </Text>

        <TouchableOpacity
          accessibilityRole="button"
          style={[s.fileCard, asset && s.fileSelected]}
          onPress={chooseFile}
          disabled={busy}
        >
          <View style={s.fileIcon}>
            <Text style={s.fileIconText}>♫</Text>
          </View>
          <View style={s.fileCopy}>
            <Text style={s.fileTitle} numberOfLines={1}>
              {asset ? asset.name : "Choose an audio file"}
            </Text>
            <Text style={s.fileMeta}>
              {asset ? formatBytes(asset.size) : "MP3, M4A, WAV, or another audio format"}
            </Text>
          </View>
          <Text style={s.changeText}>{asset ? "Change" : "＋"}</Text>
        </TouchableOpacity>

        <Text style={s.sectionLabel}>TRANSCRIPTION LANGUAGE</Text>
        <View style={s.languageList}>
          {TRANSCRIPTION_LANGUAGES.map((item) => {
            const selected = language === item.code;
            return (
              <TouchableOpacity
                key={item.code}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setLanguage(item.code)}
                disabled={busy}
                style={[s.language, selected && s.languageSelected]}
              >
                <View
                  style={[s.radio, selected && s.radioSelected]}
                >
                  {selected ? <View style={s.radioDot} /> : null}
                </View>
                <Text
                  style={[
                    s.languageLabel,
                    selected && s.languageLabelSelected,
                  ]}
                >
                  {item.label}
                </Text>
                <Text style={s.languageDetail}>{item.detail}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={s.sectionLabel}>TRANSCRIPT NAME</Text>
        <TextInput
          accessibilityLabel="Transcript name"
          style={s.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Biology lecture"
          placeholderTextColor={c.subtle}
          editable={!busy}
        />

        {error ? (
          <View accessibilityRole="alert" style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={s.privacyNote}>
          <Text style={s.privacyIcon}>ⓘ</Text>
          <Text style={s.privacyText}>
            Audio is sent to your configured transcription server. Avoid
            uploading sensitive recordings unless you trust that server.
          </Text>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          style={[s.submit, (!asset || busy) && s.submitDisabled]}
          onPress={submit}
          disabled={!asset || busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.submitText}>Upload and transcribe</Text>
          )}
        </TouchableOpacity>
        {busy ? (
          <Text style={s.progressText}>Uploading audio and transcribing…</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  content: { paddingHorizontal: 20, paddingTop: 54, paddingBottom: 32 },
  back: { alignSelf: "flex-start", paddingVertical: 8, marginBottom: 22 },
  backText: { color: c.accent, fontSize: 15, fontWeight: "600" },
  eyebrow: {
    color: c.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  heading: { color: c.text, fontSize: 29, fontWeight: "700", lineHeight: 36 },
  description: {
    color: c.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 24,
  },
  fileCard: {
    alignItems: "center",
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 84,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  fileSelected: { borderColor: c.accentBorder },
  fileIcon: {
    alignItems: "center",
    backgroundColor: c.accentSurface,
    borderRadius: 16,
    height: 48,
    justifyContent: "center",
    marginRight: 12,
    width: 48,
  },
  fileIconText: { color: c.accent, fontSize: 23, fontWeight: "600" },
  fileCopy: { flex: 1, minWidth: 0 },
  fileTitle: { color: c.text, fontSize: 15, fontWeight: "600" },
  fileMeta: { color: c.subtle, fontSize: 12, marginTop: 4 },
  changeText: { color: c.accent, fontSize: 14, fontWeight: "600", marginLeft: 8 },
  sectionLabel: {
    color: c.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 24,
  },
  languageList: { gap: 8 },
  language: {
    alignItems: "center",
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 54,
    paddingHorizontal: 14,
  },
  languageSelected: { backgroundColor: c.accentSurface, borderColor: c.accentBorder },
  radio: {
    alignItems: "center",
    borderColor: c.subtle,
    borderRadius: 10,
    borderWidth: 2,
    height: 20,
    justifyContent: "center",
    marginRight: 12,
    width: 20,
  },
  radioSelected: { borderColor: c.accent },
  radioDot: { backgroundColor: c.accent, borderRadius: 5, height: 10, width: 10 },
  languageLabel: { color: c.text, flex: 1, fontSize: 15, fontWeight: "500" },
  languageLabelSelected: { color: c.accentText, fontWeight: "600" },
  languageDetail: { color: c.subtle, fontSize: 13 },
  input: {
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: 16,
    borderWidth: 1,
    color: c.text,
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  errorBox: {
    backgroundColor: c.errorSurface,
    borderRadius: 14,
    marginTop: 16,
    padding: 14,
  },
  errorText: { color: c.errorText, fontSize: 14, lineHeight: 20 },
  privacyNote: { alignItems: "flex-start", flexDirection: "row", marginTop: 18 },
  privacyIcon: { color: c.muted, fontSize: 16, marginRight: 8 },
  privacyText: { color: c.muted, flex: 1, fontSize: 12, lineHeight: 18 },
  submit: {
    alignItems: "center",
    backgroundColor: c.accent,
    borderRadius: 28,
    justifyContent: "center",
    marginTop: 24,
    minHeight: 54,
  },
  submitDisabled: { backgroundColor: "#9bbce8" },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  progressText: { color: c.muted, fontSize: 13, marginTop: 12, textAlign: "center" },
  });
}
