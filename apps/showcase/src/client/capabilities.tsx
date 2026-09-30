"use client"

import { createAuthCapability } from "@plainworks/app/capabilities/auth"
import { createHttpCapability } from "@plainworks/app/capabilities/http"
import { createQueryCapability } from "@plainworks/app/capabilities/query"
import { type AppScopes, createScopesCapability } from "@plainworks/app/capabilities/state"
import { createMotionCapability, createThemeCapability } from "@plainworks/app/capabilities/theme"
import type { ClientCapability } from "@plainworks/app/client"
import type { HttpClient } from "@plainworks/http"
import { memoryScope } from "@plainworks/state"
import { cookieScope } from "@plainworks/state/cookie"
import type { StateSource } from "@plainworks/std/seam"
import type { MotionPreference, ThemePreference } from "@plainworks/theme/preference"
import type { QueryClient } from "@tanstack/react-query"
import { session } from "./session"
import { createMotionSource } from "./settings/motion-preference"
import { createThemeSource } from "./sources"

/** The per-request pieces the client capability registry is built from. */
export interface ClientCapabilityInput {
  /** The browser (or per-request server) query client. */
  readonly queryClient: QueryClient
  /** The request-scoped HTTP client the sections read and mutate through. */
  readonly httpClient: HttpClient
  /** Where the theme choice is kept; defaults to the theme cookie. */
  readonly themeSource?: StateSource<ThemePreference>
  /** Where the motion choice is kept; defaults to the persistent scope. */
  readonly motionSource?: StateSource<MotionPreference>
}

/**
 * Assemble the client capability registry handed to `AppProvider` from the `@plainworks/app`
 * recipes. The theme and auth capabilities join their server resolvers by id. `AppProvider` orders
 * them, so registration order here does not matter.
 */
export function buildClientCapabilities(input: ClientCapabilityInput): ClientCapability[] {
  const { themeSource = createThemeSource(), motionSource = createMotionSource() } = input
  const scopes: AppScopes = { memory: memoryScope, cookie: cookieScope }
  const { capability: scopesCapability } = createScopesCapability({ scopes })
  return [
    createQueryCapability({ client: input.queryClient }),
    createHttpCapability({ client: input.httpClient }),
    createThemeCapability({ source: themeSource }),
    createMotionCapability({ source: motionSource }),
    createAuthCapability({ session }),
    scopesCapability,
  ]
}
