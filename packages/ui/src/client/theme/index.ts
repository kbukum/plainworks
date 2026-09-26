"use client"

// Re-export-only barrel for `@plainworks/ui`'s theme surface: the runtime provider comes from the
// `@plainworks/theme` substrate; the color-mode controls are authored here because they compose
// the `dropdown-menu` and `toggle-group` atoms.
export type {
  ThemeContextValue,
  ThemeProviderProps,
} from "@plainworks/theme/client"
export { ThemeProvider, useTheme } from "@plainworks/theme/client"
export type { ThemeModeGroupProps } from "./theme-mode-group"
export { ThemeModeGroup } from "./theme-mode-group"
export type { ThemeModeMenuProps } from "./theme-mode-menu"
export { ThemeModeMenu } from "./theme-mode-menu"
export type { ThemeModeIcons, ThemeModeLabels } from "./theme-mode-options"
export { defaultThemeModeLabels } from "./theme-mode-options"
