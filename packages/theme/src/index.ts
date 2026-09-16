// Server-safe public entry for `@plainworks/theme` — re-export-only barrel (no logic here). No
// React or DOM imports, so the `.` entry runs anywhere (Node, edge, RSC, React Native); the theme
// provider lives behind the `./client` subpath.
export { cn } from "./class-name"
export { ThemeError } from "./errors"
export type {
  ColorScheme,
  ResolvedTheme,
  ThemeMode,
  ThemePreference,
} from "./theme"
export {
  COLOR_SCHEMES,
  DEFAULT_THEME,
  parseThemeCookie,
  resolveTheme,
} from "./theme"
export type {
  BrandColorRole,
  RadiusStep,
  SemanticColorRole,
} from "./tokens"
export {
  BRAND_COLOR_ROLES,
  colorRoleVar,
  RADIUS_STEPS,
  SEMANTIC_COLOR_ROLES,
  semanticRoleVar,
} from "./tokens"
