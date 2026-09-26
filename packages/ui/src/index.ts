// Server-safe public entry for `@plainworks/ui` — re-export-only barrel (no logic here). No React
// or DOM imports, so the `.` entry runs anywhere (Node, edge, RSC). The design substrate (tokens,
// schemes, theme runtime) is re-exported for DX from the `@plainworks/theme` package that owns it.
// Pure view logic (`asyncStatus`) is exported here too, so server code can use it without crossing
// a `"use client"` boundary. The React behaviour hooks are React (not neutral), so they ship from
// `./client`, never here.

export type {
  BrandColorRole,
  ColorScheme,
  RadiusStep,
  ResolvedTheme,
  SemanticColorRole,
  StatusTone,
  ThemeMode,
  ThemePreference,
  ThemeToken,
} from "@plainworks/theme"
export {
  BRAND_COLOR_ROLES,
  COLOR_SCHEMES,
  DEFAULT_THEME,
  parseThemeCookie,
  RADIUS_STEPS,
  resolveTheme,
  SEMANTIC_COLOR_ROLES,
  STATUS_TONES,
  themeVar,
} from "@plainworks/theme"

export type { AsyncFlags, AsyncStatus } from "./region"
export { asyncStatus } from "./region"
