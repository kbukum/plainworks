import "server-only"

// The server-only identity wiring for the running host: it binds `@plainworks/auth`'s session flow
// to `@plainworks/testkit`'s in-process mock OpenID Provider. The provider mints real,
// JWKS-verifiable tokens, so the adapter runs its genuine Authorization Code + PKCE + nonce path —
// only the network is faked. This module carries the `server-only` marker: it custodies the signing
// key and the provider's token endpoint, so a `"use client"` graph importing it fails the build.

import type { MockIdp } from "@plainworks/testkit"
import { createMockIdp } from "@plainworks/testkit"
import { AUTH_CALLBACK_PATH } from "../neutral/constants"
import { createNextAuth, type NextAuth } from "./auth"
import { appOrigin } from "./origin"
import { resolveSigningKey } from "./signing-key"

/** The assembled host session flow plus the mock provider that stands in for the interactive login. */
export interface HostAuth {
  /** The `@plainworks/auth` session composition driving `/login`, `/auth/callback`, `/logout`. */
  readonly auth: NextAuth
  /** The in-process provider — its `authorize` bounces straight to the callback (no login page). */
  readonly idp: MockIdp
}

const GLOBAL_AUTH = Symbol.for("@plainworks/next-host.auth")

type GlobalWithAuth = typeof globalThis & {
  [GLOBAL_AUTH]?: Promise<HostAuth>
}

// The mock provider holds the pending authorization codes between `/login` and `/auth/callback`, so
// it must be one shared instance across those requests — hence a lazily-built singleton created on
// first use, never at import time (key generation is async). Anchored on globalThis so the separate
// server chunks Next.js emits (route handlers vs RSC) share the single provider and signing key.
//
// Dev-only note: This in-process mock identity provider is a single-process dev adapter. In a
// multi-instance or serverless deployment, login and callback can hit different instances; replace
// this with a real external OIDC issuer (e.g. Auth0, Keycloak, or Okta) and configure a shared
// SESSION_SIGNING_KEY.
async function build(): Promise<HostAuth> {
  const idp = await createMockIdp({ claims: { name: "Ada Lovelace" } })
  const auth = createNextAuth({
    fetch: idp.fetch,
    issuer: idp.issuer,
    clientId: idp.clientId,
    redirectUri: `${appOrigin()}${AUTH_CALLBACK_PATH}`,
    signingKey: resolveSigningKey(),
  })
  return { auth, idp }
}

/** The host's shared authentication, created on first use. */
export function hostAuth(): Promise<HostAuth> {
  const target = globalThis as GlobalWithAuth
  target[GLOBAL_AUTH] ??= build()
  return target[GLOBAL_AUTH]
}
