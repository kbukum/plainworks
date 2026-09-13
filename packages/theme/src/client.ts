"use client"

// Client public entry for `@plainworks/theme` — re-export-only barrel over the theme runtime
// provider (never the server `.` barrel). The per-module `"use client"` directive makes tsdown emit
// this (and only the client graph) as the client entry; the neutral `.` entry stays DOM-free.
export type {
  ThemeContextValue,
  ThemeProviderProps,
} from "./client/theme"
export { ThemeProvider, useTheme } from "./client/theme"
