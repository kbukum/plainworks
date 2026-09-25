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
  isThemePreference,
  parseThemeCookie,
  resolveTheme,
  themePreferenceOf,
} from "./theme"
export type {
  BrandColorRole,
  Density,
  DensitySpace,
  ElevationLevel,
  FocusRingToken,
  FontRole,
  MotionDuration,
  MotionEasing,
  RadiusStep,
  SemanticColorRole,
  StackingLayer,
  StatusTone,
  ThemeToken,
  TypeStep,
} from "./tokens"
export {
  BRAND_COLOR_ROLES,
  DENSITIES,
  DENSITY_SPACES,
  ELEVATION_LEVELS,
  FONT_ROLES,
  MOTION_DURATIONS,
  MOTION_EASINGS,
  RADIUS_STEPS,
  SEMANTIC_COLOR_ROLES,
  STACKING_LAYERS,
  STATUS_TONES,
  THEME_TOKENS,
  TYPE_STEPS,
  themeVar,
} from "./tokens"
