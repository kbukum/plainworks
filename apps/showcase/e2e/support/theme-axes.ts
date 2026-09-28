import type { ThemeAxes } from "@plainworks/testkit/browser"
import {
  COLOR_SCHEMES,
  type ColorScheme,
  DEFAULT_THEME,
  DENSITIES,
  resolveTheme,
} from "@plainworks/theme"

const isColorScheme = (value: string): value is ColorScheme =>
  (COLOR_SCHEMES as readonly string[]).includes(value)

/**
 * The showcase's theme vocabulary for flows: every brand color scheme and density from
 * `@plainworks/theme`, rendered on `<html>` the way the server renders it.
 */
export const SHOWCASE_THEME_AXES: ThemeAxes = {
  themes: COLOR_SCHEMES,
  densities: DENSITIES,
  defaultTheme: DEFAULT_THEME.colorScheme,
  defaultDensity: "comfortable",
  root: ({ mode, theme, density }) => {
    if (!isColorScheme(theme)) throw new RangeError(`Unknown color scheme: ${theme}`)
    return {
      className: resolveTheme({ mode, colorScheme: theme }).htmlClass,
      attributes: { "data-density": density },
    }
  },
}
