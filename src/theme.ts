export type ThemeColors = {
  background: string;
  surface: string;
  surfaceRaised: string;
  text: string;
  muted: string;
  subtle: string;
  border: string;
  accent: string;
  accentText: string;
  accentSurface: string;
  accentBorder: string;
  input: string;
  errorSurface: string;
  errorText: string;
};

export function getTheme(isNightMode: boolean): ThemeColors {
  if (isNightMode) {
    return {
      background: "#12161c",
      surface: "#1b212a",
      surfaceRaised: "#252d38",
      text: "#f1f3f4",
      muted: "#b0bac8",
      subtle: "#8994a3",
      border: "#35404d",
      accent: "#8ab4f8",
      accentText: "#a9c7ff",
      accentSurface: "#263a56",
      accentBorder: "#42628e",
      input: "#252d38",
      errorSurface: "#4a2929",
      errorText: "#ffb4ab",
    };
  }

  return {
    background: "#f7f9fc",
    surface: "#fff",
    surfaceRaised: "#f1f3f4",
    text: "#202124",
    muted: "#5f6368",
    subtle: "#70757a",
    border: "#e7eaf0",
    accent: "#1967d2",
    accentText: "#174ea6",
    accentSurface: "#e8f0fe",
    accentBorder: "#a8c7fa",
    input: "#edf1f7",
    errorSurface: "#fce8e6",
    errorText: "#b3261e",
  };
}
