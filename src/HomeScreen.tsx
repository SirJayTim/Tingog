import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Lecture, loadLectures } from "./storage";
import { getTheme, type ThemeColors } from "./theme";

const LIVE_LANGS = [
  { code: "fil-PH", label: "Tagalog" },
  { code: "en-US", label: "English" },
  { code: "en-PH", label: "English (PH)" },
];

type Props = {
  lang: string;
  isNightMode: boolean;
  onToggleNightMode: () => void;
  onLang: (code: string) => void;
  onOpen: (id: string) => void;
  onRecord: () => void;
  onUpload: () => void;
};

export default function HomeScreen({
  lang,
  isNightMode,
  onToggleNightMode,
  onLang,
  onOpen,
  onRecord,
  onUpload,
}: Props) {
  const c = getTheme(isNightMode);
  const s = useMemo(() => createStyles(getTheme(isNightMode)), [isNightMode]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    loadLectures().then(setLectures);
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lectures;
    return lectures.filter(
      (l) =>
        l.title.toLowerCase().includes(q) || l.text.toLowerCase().includes(q)
    );
  }, [lectures, query]);

  return (
    <View style={s.container}>
      <FlatList
        data={shown}
        keyExtractor={(lecture) => lecture.id}
        contentContainerStyle={s.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <View style={s.brandRow}>
              <View style={s.brandIdentity}>
                <View style={s.brandMark}>
                  <Text style={s.brandMarkText}>T</Text>
                </View>
                <View>
                  <Text style={s.brand}>Tingog</Text>
                  <Text style={s.brandSub}>LECTURE NOTES</Text>
                </View>
              </View>
              <TouchableOpacity
                accessibilityRole="switch"
                accessibilityState={{ checked: isNightMode }}
                accessibilityLabel="Night mode"
                style={s.themeToggle}
                onPress={onToggleNightMode}
              >
                <Text style={s.themeToggleIcon}>{isNightMode ? "☀" : "☾"}</Text>
                <Text style={s.themeToggleText}>
                  {isNightMode ? "Day" : "Night"}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={s.headline}>Every lecture,{"\n"}a little clearer.</Text>
            <Text style={s.intro}>
              Record live or upload audio to create searchable notes in English,
              Tagalog, or Hiligaynon.
            </Text>

            <View style={s.actionRow}>
              <TouchableOpacity
                accessibilityRole="button"
                style={s.recordAction}
                onPress={onRecord}
              >
                <Text style={s.recordIcon}>●</Text>
                <Text style={s.recordActionText}>Record live</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                style={s.uploadAction}
                onPress={onUpload}
              >
                <Text style={s.uploadIcon}>↑</Text>
                <Text style={s.uploadActionText}>Upload audio</Text>
              </TouchableOpacity>
            </View>

            <View style={s.liveCard}>
              <Text style={s.sectionLabel}>LIVE SPEECH LANGUAGE</Text>
              <View style={s.langRow}>
                {LIVE_LANGS.map((item) => {
                  const active = lang === item.code;
                  return (
                    <TouchableOpacity
                      key={item.code}
                      onPress={() => onLang(item.code)}
                      style={[s.chip, active && s.chipOn]}
                    >
                      <Text style={[s.chipText, active && s.chipTextOn]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={s.hint}>
                For Hiligaynon, upload a recording and select Hiligaynon for
                server transcription.
              </Text>
            </View>

            <View style={s.libraryHeader}>
              <View>
                <Text style={s.libraryTitle}>Your library</Text>
                <Text style={s.librarySub}>
                  {lectures.length} {lectures.length === 1 ? "transcript" : "transcripts"}
                </Text>
              </View>
              <TextInput
                accessibilityLabel="Search transcripts"
                style={s.search}
                value={query}
                onChangeText={setQuery}
                placeholder="Search"
                placeholderTextColor={c.subtle}
                returnKeyType="search"
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>♫</Text>
            <Text style={s.emptyTitle}>
              {lectures.length ? "No matches found" : "Your notes start here"}
            </Text>
            <Text style={s.emptyText}>
              {lectures.length
                ? "Try another title or keyword."
                : "Record a lecture or upload an audio file to get a transcript."}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            accessibilityRole="button"
            style={s.card}
            onPress={() => onOpen(item.id)}
          >
            <View style={s.cardHeader}>
              <View style={s.cardIcon}>
                <Text style={s.cardIconText}>≋</Text>
              </View>
              <View style={s.cardHeading}>
                <Text style={s.cardTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={s.cardMeta} numberOfLines={1}>
                  {new Date(item.createdAt).toLocaleDateString()}
                  {item.durationSec > 0
                    ? `  ·  ${Math.max(1, Math.round(item.durationSec / 60))} min`
                    : ""}
                </Text>
              </View>
              <Text style={s.chevron}>›</Text>
            </View>
            <Text style={s.cardText} numberOfLines={2}>
              {item.text}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  list: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 32 },
  brandRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  brandIdentity: { alignItems: "center", flexDirection: "row" },
  themeToggle: {
    alignItems: "center",
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  themeToggleIcon: { color: c.accent, fontSize: 16, marginRight: 6 },
  themeToggleText: { color: c.text, fontSize: 12, fontWeight: "600" },
  brandMark: {
    alignItems: "center",
    backgroundColor: c.accent,
    borderRadius: 15,
    height: 42,
    justifyContent: "center",
    marginRight: 11,
    width: 42,
  },
  brandMarkText: { color: "#fff", fontSize: 23, fontWeight: "700" },
  brand: { color: c.text, fontSize: 18, fontWeight: "700" },
  brandSub: {
    color: c.subtle,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginTop: 2,
  },
  headline: {
    color: c.text,
    fontSize: 35,
    fontWeight: "700",
    letterSpacing: -0.7,
    lineHeight: 41,
  },
  intro: { color: c.muted, fontSize: 15, lineHeight: 22, marginTop: 10 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 22 },
  recordAction: {
    alignItems: "center",
    backgroundColor: c.accent,
    borderRadius: 24,
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 12,
  },
  recordIcon: { color: "#fff", fontSize: 12, marginRight: 8 },
  recordActionText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  uploadAction: {
    alignItems: "center",
    backgroundColor: c.accentSurface,
    borderRadius: 24,
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 12,
  },
  uploadIcon: { color: c.accent, fontSize: 19, fontWeight: "600", marginRight: 7 },
  uploadActionText: { color: c.accentText, fontSize: 14, fontWeight: "600" },
  liveCard: {
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 18,
    padding: 16,
  },
  sectionLabel: {
    color: c.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 11,
  },
  langRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    borderColor: c.border,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipOn: { backgroundColor: c.accentSurface, borderColor: c.accentBorder },
  chipText: { color: c.muted, fontSize: 12, fontWeight: "500" },
  chipTextOn: { color: c.accentText, fontWeight: "600" },
  hint: { color: c.subtle, fontSize: 12, lineHeight: 17, marginTop: 12 },
  libraryHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    marginTop: 28,
  },
  libraryTitle: { color: c.text, fontSize: 21, fontWeight: "700" },
  librarySub: { color: c.subtle, fontSize: 12, marginTop: 3 },
  search: {
    backgroundColor: c.input,
    borderRadius: 18,
    color: c.text,
    fontSize: 13,
    minWidth: 92,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: c.surface,
    borderRadius: 22,
    marginTop: 4,
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  emptyIcon: { color: c.accent, fontSize: 27 },
  emptyTitle: { color: c.text, fontSize: 16, fontWeight: "600", marginTop: 10 },
  emptyText: {
    color: c.subtle,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    textAlign: "center",
  },
  card: {
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 10,
    padding: 15,
  },
  cardHeader: { alignItems: "center", flexDirection: "row" },
  cardIcon: {
    alignItems: "center",
    backgroundColor: c.surfaceRaised,
    borderRadius: 14,
    height: 42,
    justifyContent: "center",
    marginRight: 12,
    width: 42,
  },
  cardIconText: { color: c.accent, fontSize: 20, fontWeight: "600" },
  cardHeading: { flex: 1 },
  cardTitle: { color: c.text, fontSize: 15, fontWeight: "600" },
  cardMeta: { color: c.subtle, fontSize: 11, marginTop: 4 },
  chevron: { color: c.subtle, fontSize: 24, marginLeft: 8 },
  cardText: { color: c.muted, fontSize: 13, lineHeight: 19, marginTop: 12 },
  });
}
