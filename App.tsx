import { useEffect, useState } from "react";
import { Alert, BackHandler } from "react-native";
import { StatusBar } from "expo-status-bar";
import HomeScreen from "./src/HomeScreen";
import RecordScreen from "./src/RecordScreen";
import TranscribeScreen from "./src/TranscribeScreen";
import DetailScreen from "./src/DetailScreen";
import {
  loadLang,
  loadNightMode,
  saveLang,
  saveNightMode,
} from "./src/storage";

type Screen =
  | { name: "home"; key: number }
  | { name: "record" }
  | { name: "transcribe" }
  | { name: "detail"; id: string };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "home", key: 0 });
  const [lang, setLang] = useState("fil-PH");
  const [isNightMode, setIsNightMode] = useState(false);

  useEffect(() => {
    loadLang().then(setLang);
    loadNightMode()
      .then(setIsNightMode)
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Unknown storage error";
        Alert.alert("Could not load appearance setting", message);
      });
  }, []);

  const goHome = () =>
    setScreen((s) => ({ name: "home", key: Date.now() }));

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (screen.name === "home") return false; // let Android exit the app
      goHome();
      return true;
    });
    return () => sub.remove();
  }, [screen]);

  const changeLang = (code: string) => {
    setLang(code);
    saveLang(code);
  };

  const toggleNightMode = async () => {
    const nextMode = !isNightMode;
    try {
      await saveNightMode(nextMode);
      setIsNightMode(nextMode);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown storage error";
      Alert.alert("Could not save appearance setting", message);
    }
  };

  return (
    <>
      <StatusBar style={isNightMode ? "light" : "dark"} />
      {screen.name === "home" && (
        <HomeScreen
          key={screen.key}
          lang={lang}
          isNightMode={isNightMode}
          onToggleNightMode={toggleNightMode}
          onLang={changeLang}
          onOpen={(id) => setScreen({ name: "detail", id })}
          onRecord={() => setScreen({ name: "record" })}
          onUpload={() => setScreen({ name: "transcribe" })}
        />
      )}
      {screen.name === "record" && (
        <RecordScreen
          lang={lang}
          isNightMode={isNightMode}
          onSaved={(id) => setScreen({ name: "detail", id })}
          onCancel={goHome}
        />
      )}
      {screen.name === "transcribe" && (
        <TranscribeScreen
          isNightMode={isNightMode}
          onSaved={(id) => setScreen({ name: "detail", id })}
          onCancel={goHome}
        />
      )}
      {screen.name === "detail" && (
        <DetailScreen
          id={screen.id}
          isNightMode={isNightMode}
          onBack={goHome}
        />
      )}
    </>
  );
}