/**
 * The semantic color roles the kit styles against. Components use these roles only, never raw
 * palette values, so a mode or color scheme swaps by reassigning the roles with no JS.
 */

/**
 * Status tones for feedback such as badges, callouts, and validation. Each tone has a fill role and
 * a `-foreground` role that reads on it. Pair a tone with text or an icon; color alone is never
 * the only signal.
 */
export const STATUS_TONES = ["info", "success", "warning", "destructive"] as const

export type StatusTone = (typeof STATUS_TONES)[number]

/**
 * Categorical colors that tell items apart, such as the setups in a comparison. They are separate
 * from the status tones and carry no meaning of their own: pair each with a letter or a name, since
 * color is never the only cue. Each is a fill that `series-foreground` text reads on, and each
 * meets 3:1 against the page and card surfaces.
 */
export const SERIES_COLORS = [
  "series-1",
  "series-2",
  "series-3",
  "series-4",
  "series-5",
  "series-6",
  "series-7",
  "series-8",
] as const

export type SeriesColor = (typeof SERIES_COLORS)[number]

/** Every semantic color role, exposed to Tailwind as `--color-<role>` and at runtime as `--pw-<role>`. */
export const SEMANTIC_COLOR_ROLES = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "info",
  "info-foreground",
  "success",
  "success-foreground",
  "warning",
  "warning-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
  "series-1",
  "series-2",
  "series-3",
  "series-4",
  "series-5",
  "series-6",
  "series-7",
  "series-8",
  "series-foreground",
] as const

export type SemanticColorRole = (typeof SEMANTIC_COLOR_ROLES)[number]

/** The roles a color scheme reassigns. `ring` is the focus indicator color. */
export const BRAND_COLOR_ROLES = ["primary", "primary-foreground", "ring"] as const

export type BrandColorRole = (typeof BRAND_COLOR_ROLES)[number]
