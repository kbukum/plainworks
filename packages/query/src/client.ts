"use client"

// Client public entry for `@plainworks/query` — re-export-only barrel over the `"use client"` provider
// concern (never the server `.` barrel). The provider is pure React context (DOM-free), so it also runs
// on React Native/Expo. tsdown emits this graph as the `./client` entry from the per-module directive.
export type { QueryProviderProps } from "./client/provider"
export { HydrationBoundary, isServerRuntime, QueryProvider } from "./client/provider"
