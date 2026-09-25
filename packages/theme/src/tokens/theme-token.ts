import { SEMANTIC_COLOR_ROLES, type SemanticColorRole } from "./color"
import { DENSITY_SPACES, type DensitySpace } from "./density"
import { ELEVATION_LEVELS, type ElevationLevel } from "./elevation"
import { MOTION_DURATIONS, MOTION_EASINGS, type MotionDuration, type MotionEasing } from "./motion"
import { STACKING_LAYERS, type StackingLayer } from "./stacking"
import { FONT_ROLES, type FontRole, TYPE_STEPS, type TypeStep } from "./typography"

/** The focus indicator's outline width and its offset from the focused element. */
export type FocusRingToken = "focus-width" | "focus-offset"

/** Every public Tier 2 token, named without its `--pw-` prefix. */
export type ThemeToken =
  | SemanticColorRole
  | "radius"
  | `font-${FontRole}`
  | `text-${TypeStep}`
  | `text-${TypeStep}-leading`
  | `space-${DensitySpace}`
  | `shadow-${ElevationLevel}`
  | FocusRingToken
  | `duration-${MotionDuration}`
  | `ease-${MotionEasing}`
  | `z-${StackingLayer}`

/** Every theme token, one entry each. */
export const THEME_TOKENS: readonly ThemeToken[] = [
  ...SEMANTIC_COLOR_ROLES,
  "radius",
  ...FONT_ROLES.map((role) => `font-${role}` as const),
  ...TYPE_STEPS.flatMap((step) => [`text-${step}` as const, `text-${step}-leading` as const]),
  ...DENSITY_SPACES.map((space) => `space-${space}` as const),
  ...ELEVATION_LEVELS.map((level) => `shadow-${level}` as const),
  "focus-width",
  "focus-offset",
  ...MOTION_DURATIONS.map((duration) => `duration-${duration}` as const),
  ...MOTION_EASINGS.map((easing) => `ease-${easing}` as const),
  ...STACKING_LAYERS.map((layer) => `z-${layer}` as const),
]

/**
 * Reference a token through its runtime custom property, for inline styles and non-Tailwind CSS:
 * `themeVar("z-toast")` returns `"var(--pw-z-toast)"`. Tailwind code uses the matching utility
 * instead (`z-toast`, `bg-primary`).
 */
export function themeVar(token: ThemeToken): string {
  return `var(--pw-${token})`
}
