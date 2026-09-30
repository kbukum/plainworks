/** The explicit color modes a page variant renders in. */
export const FLOW_MODES = ["light", "dark"] as const

/** One mode of {@link FLOW_MODES}. */
export type FlowMode = (typeof FLOW_MODES)[number]

/** How one user preference emulates the page's media features and text size. */
export interface PreferenceEmulation {
  readonly reducedMotion: "reduce" | "no-preference"
  readonly forcedColors: "active" | "none"
  readonly contrast: "more" | "no-preference"
  /** Root text size as a multiple of the default: `2` is 200% text zoom (WCAG 1.4.4). */
  readonly textScale: 1 | 2
}

/**
 * The user preferences a page variant can apply. `standard` is the deterministic baseline every
 * run starts from: reduced motion and nothing else. `full-motion` lets transitions run, so a flow
 * proves its motion settles. The rest are one accessibility preference each.
 */
export const PREFERENCES: {
  readonly standard: PreferenceEmulation
  readonly "full-motion": PreferenceEmulation
  readonly "forced-colors": PreferenceEmulation
  readonly "more-contrast": PreferenceEmulation
  readonly "text-200": PreferenceEmulation
} = {
  standard: {
    reducedMotion: "reduce",
    forcedColors: "none",
    contrast: "no-preference",
    textScale: 1,
  },
  "full-motion": {
    reducedMotion: "no-preference",
    forcedColors: "none",
    contrast: "no-preference",
    textScale: 1,
  },
  "forced-colors": {
    reducedMotion: "reduce",
    forcedColors: "active",
    contrast: "no-preference",
    textScale: 1,
  },
  "more-contrast": {
    reducedMotion: "reduce",
    forcedColors: "none",
    contrast: "more",
    textScale: 1,
  },
  "text-200": {
    reducedMotion: "reduce",
    forcedColors: "none",
    contrast: "no-preference",
    textScale: 2,
  },
}

/** One preference of {@link PREFERENCES}. */
export type PreferenceId = keyof typeof PREFERENCES

/** Every preference id, in declaration order. */
export const PREFERENCE_IDS: readonly PreferenceId[] = [
  "standard",
  "full-motion",
  "forced-colors",
  "more-contrast",
  "text-200",
]

/** What the root element carries for one mode, brand theme, and density. */
export interface ThemeRoot {
  /** The `<html>` class list, such as `dark theme-indigo`. */
  readonly className: string
  /** Attributes the root carries, such as `{ "data-density": "compact" }`. */
  readonly attributes: Readonly<Record<string, string>>
}

/**
 * The host's theme vocabulary and how the root element renders it. The host passes the lists from
 * its design-token package (for plainworks, `COLOR_SCHEMES` and `DENSITIES` from
 * `@plainworks/theme`, with `resolveTheme` building the class), so the engine stays theme-agnostic.
 */
export interface ThemeAxes {
  readonly themes: readonly string[]
  readonly densities: readonly string[]
  readonly defaultTheme: string
  readonly defaultDensity: string
  readonly root: (variant: {
    readonly mode: FlowMode
    readonly theme: string
    readonly density: string
  }) => ThemeRoot
}

/** Define host theme axes while keeping theme and density values type-safe. */
export function defineThemeAxes<const Theme extends string, const Density extends string>(options: {
  readonly themes: readonly Theme[]
  readonly densities: readonly Density[]
  readonly defaultTheme: Theme
  readonly defaultDensity: Density
  readonly root: (variant: {
    readonly mode: FlowMode
    readonly theme: Theme
    readonly density: Density
  }) => ThemeRoot
}): ThemeAxes {
  return {
    themes: options.themes,
    densities: options.densities,
    defaultTheme: options.defaultTheme,
    defaultDensity: options.defaultDensity,
    root: ({ mode, theme, density }) => {
      const knownTheme = options.themes.find((candidate) => candidate === theme)
      const knownDensity = options.densities.find((candidate) => candidate === density)
      if (knownTheme === undefined) throw new RangeError(`Unknown theme: ${theme}`)
      if (knownDensity === undefined) throw new RangeError(`Unknown density: ${density}`)
      return options.root({ mode, theme: knownTheme, density: knownDensity })
    },
  }
}

/**
 * The theme axes of a host without brand themes or densities: one value each, and a root that
 * carries only the mode class.
 */
export const MODE_ONLY_THEME_AXES: ThemeAxes = {
  themes: ["default"],
  densities: ["default"],
  defaultTheme: "default",
  defaultDensity: "default",
  root: ({ mode }) => ({ className: mode, attributes: {} }),
}

/** One page-level cell of the matrix: everything a live page can switch without a reload. */
export interface PageVariant {
  /** `mode.theme.density.preference`, stable for as long as its values exist. */
  readonly id: string
  readonly mode: FlowMode
  readonly theme: string
  readonly density: string
  readonly preference: PreferenceId
}

/** Build a page variant with its stable id. */
export function pageVariant(values: Omit<PageVariant, "id">): PageVariant {
  return {
    id: `${values.mode}.${values.theme}.${values.density}.${values.preference}`,
    ...values,
  }
}
