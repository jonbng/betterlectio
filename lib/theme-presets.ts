export const THEME_PRESETS = [
  {
    id: "default",
    label: "Default",
    colors: {
      light: { bg: "oklch(0.985 0.004 265)", sidebar: "oklch(0.97 0.006 265)", primary: "oklch(0.54 0.2 265)", accent: "oklch(0.94 0.012 265)" },
      dark: { bg: "oklch(0.145 0.004 285)", sidebar: "oklch(0.12 0.004 285)", primary: "oklch(0.65 0.16 265)", accent: "oklch(0.2 0.006 285)" },
    },
  },
  {
    id: "graphite",
    label: "Graphite",
    colors: {
      light: { bg: "oklch(0.965 0.003 255)", sidebar: "oklch(0.95 0.005 255)", primary: "oklch(0.62 0.16 235)", accent: "oklch(0.92 0.006 255)" },
      dark: { bg: "oklch(0.13 0.003 255)", sidebar: "oklch(0.11 0.003 255)", primary: "oklch(0.72 0.13 235)", accent: "oklch(0.2 0.004 255)" },
    },
  },
  {
    id: "sand",
    label: "Sand",
    colors: {
      light: { bg: "oklch(0.982 0.006 90)", sidebar: "oklch(0.965 0.012 90)", primary: "oklch(0.72 0.16 85)", accent: "oklch(0.92 0.012 90)" },
      dark: { bg: "oklch(0.14 0.004 80)", sidebar: "oklch(0.12 0.004 80)", primary: "oklch(0.78 0.13 85)", accent: "oklch(0.21 0.005 80)" },
    },
  },
  {
    id: "forest",
    label: "Forest",
    colors: {
      light: { bg: "oklch(0.98 0.006 160)", sidebar: "oklch(0.96 0.012 160)", primary: "oklch(0.61 0.15 160)", accent: "oklch(0.92 0.016 160)" },
      dark: { bg: "oklch(0.13 0.005 160)", sidebar: "oklch(0.11 0.005 160)", primary: "oklch(0.7 0.13 160)", accent: "oklch(0.2 0.006 160)" },
    },
  },
  {
    id: "pink",
    label: "Pink",
    colors: {
      light: { bg: "oklch(0.982 0.012 340)", sidebar: "oklch(0.96 0.022 340)", primary: "oklch(0.58 0.22 350)", accent: "oklch(0.92 0.022 340)" },
      dark: { bg: "oklch(0.14 0.008 335)", sidebar: "oklch(0.12 0.008 335)", primary: "oklch(0.68 0.18 350)", accent: "oklch(0.21 0.01 335)" },
    },
  },
  {
    id: "ocean",
    label: "Ocean",
    colors: {
      light: { bg: "oklch(0.982 0.006 220)", sidebar: "oklch(0.962 0.014 220)", primary: "oklch(0.6 0.17 235)", accent: "oklch(0.925 0.02 220)" },
      dark: { bg: "oklch(0.145 0.004 285)", sidebar: "oklch(0.125 0.004 285)", primary: "oklch(0.71 0.14 235)", accent: "oklch(0.22 0.008 235)" },
    },
  },
  {
    id: "copper",
    label: "Copper",
    colors: {
      light: { bg: "oklch(0.984 0.007 55)", sidebar: "oklch(0.964 0.015 55)", primary: "oklch(0.66 0.18 45)", accent: "oklch(0.93 0.02 55)" },
      dark: { bg: "oklch(0.145 0.004 285)", sidebar: "oklch(0.125 0.004 285)", primary: "oklch(0.75 0.14 45)", accent: "oklch(0.23 0.008 45)" },
    },
  },
  {
    id: "iris",
    label: "Iris",
    colors: {
      light: { bg: "oklch(0.982 0.008 300)", sidebar: "oklch(0.962 0.016 300)", primary: "oklch(0.62 0.18 305)", accent: "oklch(0.93 0.02 300)" },
      dark: { bg: "oklch(0.145 0.004 285)", sidebar: "oklch(0.125 0.004 285)", primary: "oklch(0.72 0.14 305)", accent: "oklch(0.22 0.009 305)" },
    },
  },
] as const;

export type ThemePresetId = (typeof THEME_PRESETS)[number]["id"];

export interface ThemePreference {
  themeId: ThemePresetId;
}

export const DEFAULT_THEME_PREFERENCE: ThemePreference = {
  themeId: "default",
};
