// The Next host's authentication factory — the reference application authenticates through
// `@plainworks/auth`'s own `createServerSession` composition, never a hand-assembled cookie/signer/
// CSRF flow. This server-only module assembles the OIDC Authorization Code + PKCE adapter and the
// HMAC session signer behind an injected `fetch` seam, resolves the session from the request cookie
// into the AppSnapshot so the dashboard can be gated, and exposes the read seam the RSC layout
// consumes. React-free, and the IdP `fetch` is injected by the caller (the server-only
// identity-provider wiring / the tests), so nothing here imports the dev/test provider. It carries
// the `server-only` marker: it custodies the signing key and drives the token exchange, so a
// `"use client"` graph importing it fails the build rather than bundling the flow.

import "server-only"

import { isAuthErrorKind } from "@plainworks/auth"
import { defaultAuthCrypto } from "@plainworks/auth/crypto"
import {
  createRequestJar,
  createServerSession,
  hmacSessionSigner,
  type OpaqueSessionStore,
  oidcAdapter,
  type RefreshTokenStore,
  type ServerSession,
  type ServerSessionJar,
} from "@plainworks/auth/server"
import { ANONYMOUS_AUTH, type AuthSnapshot } from "@plainworks/auth/session"
import { isAbsentOr, isRecord } from "@plainworks/std"
import { guardSchema, type StandardSchemaV1 } from "@plainworks/std/seam"
import { systemClock } from "@plainworks/std/time"
import type { WebFetch } from "@plainworks/std/web"
import { LOGIN_PATH } from "../neutral/constants"

/** Identity persisted in the injected server store, never in a browser cookie. */
export interface NextSessionValue {
  readonly subject: string
  readonly name?: string
}

/** Resolve the client-safe auth slice from a request `Cookie` header. */
export type ReadSession = (cookieHeader: string) => Promise<AuthSnapshot>

export const nextSessionSchema: StandardSchemaV1<unknown, NextSessionValue> = guardSchema(
  (value): value is NextSessionValue =>
    isRecord(value) &&
    typeof value.subject === "string" &&
    isAbsentOr(value.name, (name) => typeof name === "string"),
  "persisted identity is not a valid next-host session",
)

/** How to build the host's server session — the IdP `fetch` and endpoints are injected. */
export interface NextAuthConfig {
  readonly store: OpaqueSessionStore<NextSessionValue>
  readonly tokenStore: RefreshTokenStore
  /** The OIDC provider's `fetch` seam (the dev/test mock IdP), kept out of the render graph. */
  readonly fetch: WebFetch
  /** The provider issuer URL. */
  readonly issuer: string
  /** The registered client id. */
  readonly clientId: string
  /** The absolute redirect URI the provider calls back. */
  readonly redirectUri: string
  /** The session-signing key (a dev secret here; a KMS-backed signer in production). */
  readonly signingKey: Uint8Array
}

/** The host's assembled session flow plus the read seam the render consumes. */
export interface NextAuth {
  /** The package's session composition — drives `/login`, `/auth/callback`, `/logout`. */
  readonly session: ServerSession<typeof nextSessionSchema>
  /** Resolve the client-safe auth slice from a request `Cookie` header. */
  readonly read: ReadSession
}

/**
 * Assemble the host's authentication through `@plainworks/auth` — an OIDC Authorization Code + PKCE
 * adapter and an HMAC session signer, composed by `createServerSession`. A per-request-safe factory
 * with no module-level singleton, so nothing is shared across requests.
 */
export function createNextAuth(config: NextAuthConfig): NextAuth {
  const signer = hmacSessionSigner({ keys: [config.signingKey] })
  const adapter = oidcAdapter(
    {
      kind: "oidc",
      issuer: config.issuer,
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      signer,
      fetch: config.fetch,
      tokenStore: config.tokenStore,
    },
    { crypto: defaultAuthCrypto(), clock: systemClock },
  )
  const session = createServerSession({
    adapter,
    signer,
    sessionSchema: nextSessionSchema,
    store: config.store,
    toSessionValue: (result) => {
      const name = result.identity.claims?.name
      return { subject: result.identity.subject, ...(typeof name === "string" ? { name } : {}) }
    },
    toIdentity: (value) => ({
      subject: value.subject,
      kind: "user",
      restrictions: { mode: "unrestricted" },
      claims: value.name === undefined ? {} : { name: value.name },
    }),
    guard: { loginPath: LOGIN_PATH },
  })

  const read: ReadSession = async (cookieHeader) => {
    try {
      const status = await session.status(readOnlyJar(cookieHeader))
      const name = status.identity.claims?.name
      return {
        authenticated: true,
        subject: status.identity.subject,
        name: typeof name === "string" ? name : null,
        session: status,
      }
    } catch (cause) {
      if (
        isAuthErrorKind(cause, "auth/unauthenticated") ||
        isAuthErrorKind(cause, "auth/session-invalid")
      )
        return ANONYMOUS_AUTH
      throw cause
    }
  }

  return { session, read }
}

/** A read-only jar over a `Cookie` header; `set` is unreachable on the read path. */
function readOnlyJar(cookieHeader: string): ServerSessionJar {
  return createRequestJar({ headers: new Headers({ cookie: cookieHeader }) }).jar
}
