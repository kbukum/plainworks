"use client"

// Client public entry for `@plainworks/theme` — re-export-only barrel over the theme provider and
// the document motion writer (never the server `.` barrel). The per-module `"use client"` directive
// makes tsdown emit this (and only the client graph) as the client entry; `.` stays DOM-free.
export { useDocumentMotion } from "./client/document-motion"
export type {
  ThemeContextValue,
  ThemeProviderProps,
} from "./client/theme-provider"
export { ThemeProvider, useTheme } from "./client/theme-provider"
