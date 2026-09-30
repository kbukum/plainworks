"use client"

import { createAuthCapability } from "@plainworks/app/capabilities/auth"
import { createHttpCapability } from "@plainworks/app/capabilities/http"
import { createQueryCapability } from "@plainworks/app/capabilities/query"
import { type AppScopes, createScopesCapability } from "@plainworks/app/capabilities/state"
import { createThemeCapability } from "@plainworks/app/capabilities/theme"
import type { ClientCapability } from "@plainworks/app/client"
import type { HttpClient } from "@plainworks/http"
import { memoryScope } from "@plainworks/state"
import { cookieScope } from "@plainworks/state/cookie"
import type { StateSource } from "@plainworks/std/seam"
import type { ThemePreference } from "@plainworks/theme/preference"
import type { QueryClient } from "@tanstack/react-query"
import { session } from "./session"

/** The pieces the client capability registry is built from. */
export interface ClientCapabilityInput {
  /** The browser query client. */
  readonly queryClient: QueryClient
  /** The HTTP client the routes read through. */
  readonly httpClient: HttpClient
  /** The theme's cookie-backed source. */
  readonly themeSource: StateSource<ThemePreference>
}

/**
 * Assemble the client capability registry handed to `AppProvider` from the `@plainworks/app`
 * recipes. The theme and auth capabilities join their server resolvers by id. `AppProvider` orders
 * them, so registration order here does not matter.
 */
export function buildClientCapabilities(input: ClientCapabilityInput): ClientCapability[] {
  const scopes: AppScopes = { memory: memoryScope, cookie: cookieScope }
  const { capability: scopesCapability } = createScopesCapability({ scopes })
  return [
    createQueryCapability({ client: input.queryClient }),
    createHttpCapability({ client: input.httpClient }),
    createThemeCapability({ source: input.themeSource }),
    createAuthCapability({ session }),
    scopesCapability,
  ]
}
