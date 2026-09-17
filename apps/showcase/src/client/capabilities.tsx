"use client"

import { createQueryCapability } from "@plainworks/app/capabilities/query"
import { type AppScopes, createScopesCapability } from "@plainworks/app/capabilities/state"
import type { ClientCapability } from "@plainworks/app/client"
import { defineProvider } from "@plainworks/app/client"
import { sessionSnapshotOf } from "@plainworks/auth"
import { memoryScope } from "@plainworks/state"
import { cookieScope } from "@plainworks/state/client/scope"
import type { StateSource } from "@plainworks/std"
import { type ThemePreference, themePreferenceOf } from "@plainworks/theme"
import { ThemeProvider } from "@plainworks/theme/client"
import type { QueryClient } from "@tanstack/react-query"
import { createElement } from "react"
import { AUTH_CAPABILITY_ID, THEME_CAPABILITY_ID } from "../app/constants"
import { SessionProvider } from "./session"

/**
 * The client half of the theme capability — the provider joined by id to the neutral resolver.
 * It narrows its untrusted resolved slice (the snapshot is a trust boundary) and seeds
 * {@link ThemeProvider} with it as `initialTheme`. Explicit light/dark preferences match the
 * server-set `<html>` class; a `system` preference is corrected from the light-first server
 * fallback once the client can read the OS media query.
 */
function createThemeCapability(source: StateSource<ThemePreference>): ClientCapability {
  return defineProvider({
    id: THEME_CAPABILITY_ID,
    provider: ({ resolved, children }) =>
      createElement(ThemeProvider, { source, initialTheme: themePreferenceOf(resolved), children }),
  })
}

/**
 * The client half of the auth capability — seeds the shared {@link SessionProvider} with the
 * server-resolved session snapshot so the account bar reads the same identity the SSR gate did,
 * with no flash and no client round-trip. Narrows its untrusted resolved slice (the snapshot is a
 * trust boundary). The tokens never reach the client, so there is nothing here to custody.
 */
function createAuthCapability(): ClientCapability {
  return defineProvider({
    id: AUTH_CAPABILITY_ID,
    provider: ({ resolved, children }) =>
      createElement(SessionProvider, { initialSnapshot: sessionSnapshotOf(resolved), children }),
  })
}

/** The per-request pieces the client capability registry is built from. */
export interface ClientCapabilityInput {
  /** The browser (or per-request server) query client mounted by the query capability. */
  readonly queryClient: QueryClient
  /** The theme's cookie-backed source. */
  readonly themeSource: StateSource<ThemePreference>
}

/**
 * Assemble the client capability registry handed to `AppProvider` — the query cache, the theme
 * provider, and the published state-scope registry, each joined to its neutral resolver by id.
 * `AppProvider` topologically orders them, so registration order here does not matter.
 */
export function buildClientCapabilities(input: ClientCapabilityInput): ClientCapability[] {
  const scopes: AppScopes = { memory: memoryScope, cookie: cookieScope }
  const { capability: scopesCapability } = createScopesCapability({ scopes })
  return [
    createQueryCapability({ client: input.queryClient }),
    createThemeCapability(input.themeSource),
    createAuthCapability(),
    scopesCapability,
  ]
}
