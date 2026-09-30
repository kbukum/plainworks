"use client"

// Client public entry for `@plainworks/http`: a re-export-only barrel over the React binding that
// hands a host-built `HttpClient` to components. Pure React context, no DOM, so it also runs on
// React Native/Expo.
export type { HttpClientProviderProps } from "./client/provider"
export { HttpClientProvider, useHttpClient } from "./client/provider"
