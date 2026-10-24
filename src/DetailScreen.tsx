import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Lecture, deleteLecture, getLecture, upsertLecture } from "./storage";
import { getTheme, type ThemeColors } from "./theme";

type Props = { id: string; isNightMode: boolean; onBack: () => void };

export default function DetailScreen({ id, isNightMode, onBack }: Props) {
  const s = useMemo(() => createStyles(getTheme(isNightMode)), [isNightMode]);
  const [lecture, setLecture] = useState<Lecture | undefined>();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");

  useEffect(() => {
    getLecture(id).then((l) => {
      if (!l) return onBack();
      setLecture(l);
      setTitle(l.title);
      setText(l.text);
    });
  }, [id]);

  if (!lecture) return null;

  const dirty = title !== lecture.title || text !== lecture.text;

  const save = async () => {
    const updated = {
      ...lecture,
      title: title.trim() || "Untitled lecture",
      text,
      updatedAt: Date.now(),
    };
    await upsertLecture(updated);
    setLecture(updated);
    Alert.alert("Saved");
  };

  const copy = async () => {
    await Clipboard.setStringAsync(`${title}\n\n${text}`);
    Alert.alert("Copied to clipboard");
  };

  const share = () => Share.share({ title, message: `${title}\n\n${text}` });

  const remove = () =>
    Alert.alert("Delete this lecture?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteLecture(id);
          onBack();
        },
      },
    ]);

  return (
    <View style={s.container}>
      <TouchableOpacity onPress={onBack}>
        <Text style={s.back}>‹ Back</Text>
      </TouchableOpacity>
      <TextInput style={s.title} value={title} onChangeText={setTitle} />
      <Text style={s.meta}>
        {new Date(lecture.createdAt).toLocaleString()} · {lecture.lang}
      </Text>
      <ScrollView style={s.box} keyboardShouldPersistTaps="handled">
        <TextInput
          style={s.body}
          value={text}
          onChangeText={setText}
          multiline
          textAlignVertical="top"
        />
      </ScrollView>
      <View style={s.row}>
        <TouchableOpacity style={[s.btn, s.blue, !dirty && s.disabled]} onPress={save} disabled={!dirty}>
          <Text style={s.btnText}>Save</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btn, s.grey]} onPress={copy}>
          <Text style={s.btnText}>Copy</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btn, s.grey]} onPress={share}>
          <Text style={s.btnText}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btn, s.red]} onPress={remove}>
          <Text style={s.btnText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 56, backgroundColor: c.background },
  back: { color: c.accent, fontSize: 17, fontWeight: "600", marginBottom: 12 },
  title: {
    fontSize: 22,
    fontWeight: "600",
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: 16,
    borderWidth: 1,
    color: c.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  meta: { marginVertical: 10, color: c.subtle },
  box: {
    flex: 1,
    backgroundColor: c.surface,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 22,
    padding: 14,
  },
  body: { fontSize: 17, lineHeight: 26, minHeight: 300, color: c.text },
  row: { flexDirection: "row", gap: 8, marginTop: 14 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 22, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "600" },
  grey: { backgroundColor: "#5f6368" },
  red: { backgroundColor: "#b3261e" },
  blue: { backgroundColor: c.accent },
  disabled: { opacity: 0.4 },
  });
}