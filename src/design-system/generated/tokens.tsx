/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; mobile (Expo) and any other platform import this object so the
// whole product shares one source of truth.
export const tokens = {
  "color": {
    "light": {
      "background": "#ffffff",
      "foreground": "#242424",
      "border": "#e6e4e0",
      "card": "#ffffff",
      "cardForeground": "#242424",
      "popover": "#ffffff",
      "popoverForeground": "#242424",
      "primary": "#a04a2a",
      "primaryForeground": "#ffffff",
      "secondary": "#f2f2f2",
      "secondaryForeground": "#242424",
      "muted": "#f7f7f8",
      "mutedForeground": "#6b6b6b",
      "accent": "#c97a55",
      "accentForeground": "#242424",
      "destructive": "#ae1409",
      "destructiveForeground": "#ffffff",
      "input": "#757575",
      "ring": "#a04a2a",
      "chart1": "#a04a2a",
      "chart2": "#34754a",
      "chart3": "#4f7186",
      "chart4": "#c6a45c",
      "chart5": "#7b3ff2",
      "sidebar": "#f7f7f8",
      "sidebarForeground": "#242424",
      "sidebarBorder": "#e6e4e0",
      "sidebarPrimary": "#a04a2a",
      "sidebarPrimaryForeground": "#ffffff",
      "sidebarAccent": "#f2f2f2",
      "sidebarAccentForeground": "#242424",
      "sidebarRing": "#a04a2a"
    },
    "dark": {
      "background": "#000000",
      "foreground": "#ffffff",
      "border": "#1f1f1f",
      "card": "#0f0f0f",
      "cardForeground": "#ffffff",
      "popover": "#0f0f0f",
      "popoverForeground": "#ffffff",
      "primary": "#a04a2a",
      "primaryForeground": "#ffffff",
      "secondary": "#242424",
      "secondaryForeground": "#ffffff",
      "muted": "#0f0f0f",
      "mutedForeground": "#999999",
      "accent": "#c97a55",
      "accentForeground": "#000000",
      "destructive": "#ae1409",
      "destructiveForeground": "#ffffff",
      "input": "#666666",
      "ring": "#c97a55",
      "chart1": "#c97a55",
      "chart2": "#8bf799",
      "chart3": "#4f7186",
      "chart4": "#c6a45c",
      "chart5": "#7b3ff2",
      "sidebar": "#0f0f0f",
      "sidebarForeground": "#ffffff",
      "sidebarBorder": "#1f1f1f",
      "sidebarPrimary": "#a04a2a",
      "sidebarPrimaryForeground": "#ffffff",
      "sidebarAccent": "#242424",
      "sidebarAccentForeground": "#ffffff",
      "sidebarRing": "#c97a55"
    }
  },
  "fontFamily": {
    "sans": [
      "DM Sans",
      "sans-serif"
    ],
    "serif": [
      "Source Serif 4",
      "Georgia",
      "serif"
    ],
    "mono": [
      "ui-monospace",
      "SFMono-Regular",
      "Menlo",
      "Consolas",
      "monospace"
    ]
  },
  "radius": "10px",
  "spacing": "0.25rem"
} as const;

export type Tokens = typeof tokens;
export default tokens;
