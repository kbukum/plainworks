"use client"

export type { ErrorFallbackProps } from "./client/components/error-fallback"
// Client public entry for `@plainworks/ui` — re-export-only barrel over client concern
// modules (never the server `.` barrel). The per-module `"use client"` directive makes tsdown emit
// this (and only the client graph) as the client entry; the server `.` entry stays clean.
export { ErrorFallback } from "./client/components/error-fallback"
export type {
  ThemeContextValue,
  ThemeProviderProps,
  ThemeToggleProps,
} from "./client/theme"
export { ThemeProvider, ThemeToggle, useTheme } from "./client/theme"
