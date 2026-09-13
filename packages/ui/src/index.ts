// Server-safe public entry for `@plainworks/ui` — re-export-only barrel (no logic here). No React
// or DOM imports, so the `.` entry runs anywhere (Node, edge, RSC). The design substrate (tokens,
// schemes, theme runtime) is re-exported for DX from the `@plainworks/theme` package that owns it.
export type {
  BrandColorRole,
  ColorScheme,
  RadiusStep,
  ResolvedTheme,
  SemanticColorRole,
  ThemeMode,
  ThemePreference,
} from "@plainworks/theme"
export {
  BRAND_COLOR_ROLES,
  COLOR_SCHEMES,
  colorRoleVar,
  DEFAULT_THEME,
  parseThemeCookie,
  RADIUS_STEPS,
  resolveTheme,
  SEMANTIC_COLOR_ROLES,
  semanticRoleVar,
} from "@plainworks/theme"
