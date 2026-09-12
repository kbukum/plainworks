"use client"

// Client public entry for `@plainworks/app` — the headless React binding. Re-export-only barrel
// over the `"use client"` concern modules (never the server `.` barrel). It is pure React context
// (DOM-free), so it also runs on React Native/Expo; tsdown emits this graph as the `./client` entry
// from the per-module directive. It wires whatever capabilities are injected and imports no
// `@plainworks/ui` — batteries live in the showcase, not here.
export type {
  CapabilityComponent,
  CapabilityProvider,
  CapabilityProviderProps,
  ClientCapability,
} from "./client/capability"
export { defineProvider } from "./client/capability"
export { useAppSnapshot } from "./client/context"
export type {
  AppErrorBoundaryProps,
  ErrorFallbackComponent,
  ErrorFallbackProps,
} from "./client/error-boundary"
export { AppErrorBoundary } from "./client/error-boundary"
export type { AppProviderProps } from "./client/provider"
export { AppProvider, composeCapabilityProviders } from "./client/provider"
