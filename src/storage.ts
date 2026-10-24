import AsyncStorage from "@react-native-async-storage/async-storage";

export type Lecture = {
  id: string;
  title: string;
  text: string;
  createdAt: number;
  updatedAt: number;
  durationSec: number;
  lang: string;
};

const LECTURES_KEY = "tingog:lectures:v1";
const LANG_KEY = "tingog:lang:v1";
const NIGHT_MODE_KEY = "tingog:night-mode:v1";

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function loadLectures(): Promise<Lecture[]> {
  try {
    const raw = await AsyncStorage.getItem(LECTURES_KEY);
    const list: Lecture[] = raw ? JSON.parse(raw) : [];
    return list.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function getLecture(id: string): Promise<Lecture | undefined> {
  const list = await loadLectures();
  return list.find((l) => l.id === id);
}

export async function upsertLecture(lecture: Lecture): Promise<void> {
  const list = await loadLectures();
  const i = list.findIndex((l) => l.id === lecture.id);
  if (i >= 0) list[i] = lecture;
  else list.push(lecture);
  await AsyncStorage.setItem(LECTURES_KEY, JSON.stringify(list));
}

export async function deleteLecture(id: string): Promise<void> {
  const list = await loadLectures();
  await AsyncStorage.setItem(
    LECTURES_KEY,
    JSON.stringify(list.filter((l) => l.id !== id))
  );
}

export async function loadLang(): Promise<string> {
  return (await AsyncStorage.getItem(LANG_KEY)) || "fil-PH";
}

export async function saveLang(lang: string): Promise<void> {
  await AsyncStorage.setItem(LANG_KEY, lang);
}

export async function loadNightMode(): Promise<boolean> {
  return (await AsyncStorage.getItem(NIGHT_MODE_KEY)) === "true";
}

export async function saveNightMode(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(NIGHT_MODE_KEY, enabled ? "true" : "false");
}