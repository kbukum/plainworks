"use client"

// Re-export-only barrel for `@plainworks/ui`'s theme surface: the runtime provider comes from the
// `@plainworks/theme` substrate; the ready-made `ThemeToggle` is authored here because it composes
// the `Button` atom.
export type {
  ThemeContextValue,
  ThemeProviderProps,
} from "@plainworks/theme/client"
export { ThemeProvider, useTheme } from "@plainworks/theme/client"
export type { ThemeToggleProps } from "./theme-toggle"
export { ThemeToggle } from "./theme-toggle"
