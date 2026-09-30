import { defineThemeAxes } from "@plainworks/testkit/playwright"
import { COLOR_SCHEMES, DEFAULT_THEME, resolveTheme } from "@plainworks/theme/preference"
import { DENSITIES } from "@plainworks/theme/tokens"

/**
 * The showcase's theme vocabulary for flows: every brand color scheme and density from
 * `@plainworks/theme`, rendered on `<html>` the way the server renders it.
 */
export const SHOWCASE_THEME_AXES = defineThemeAxes({
  themes: COLOR_SCHEMES,
  densities: DENSITIES,
  defaultTheme: DEFAULT_THEME.colorScheme,
  defaultDensity: "comfortable",
  root: ({ mode, theme, density }) => {
    return {
      className: resolveTheme({ mode, colorScheme: theme }).htmlClass,
      attributes: { "data-density": density },
    }
  },
})
