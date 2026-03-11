export const THEME_PRESETS = [
  { id: "default", label: "Default" },
  { id: "graphite", label: "Graphite" },
  { id: "sand", label: "Sand" },
  { id: "forest", label: "Forest" },
  { id: "pink", label: "Pink" },
] as const;

export type ThemePresetId = (typeof THEME_PRESETS)[number]["id"];

export interface ThemePreference {
  themeId: ThemePresetId;
}

export const DEFAULT_THEME_PREFERENCE: ThemePreference = {
  themeId: "default",
};

