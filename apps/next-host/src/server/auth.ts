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

import { type Capability, defineCapability } from "@plainworks/app"
import { ANONYMOUS_AUTH, type AuthSnapshot, defaultAuthCrypto } from "@plainworks/auth"
import {
  createServerSession,
  hmacSessionSigner,
  oidcAdapter,
  type ServerSession,
  type ServerSessionJar,
} from "@plainworks/auth/server"
import {
  guardSchema,
  isAbsentOr,
  isRecord,
  parseCookieHeader,
  type StandardSchemaV1,
  systemClock,
  type WebFetch,
} from "@plainworks/std"
import { AUTH_CAPABILITY_ID, LOGIN_PATH } from "../neutral/constants"

/** The value persisted in the signed session cookie — identity only, never a token. */
export interface NextSessionValue {
  readonly subject: string
  readonly name?: string
}

/** Resolve the client-safe auth slice from a request `Cookie` header. */
export type ReadSession = (cookieHeader: string) => Promise<AuthSnapshot>

const sessionSchema: StandardSchemaV1<unknown, NextSessionValue> = guardSchema(
  (value): value is NextSessionValue =>
    isRecord(value) &&
    typeof value.subject === "string" &&
    isAbsentOr(value.name, (name) => typeof name === "string"),
  "session cookie payload is not a valid next-host session",
)

/** How to build the host's server session — the IdP `fetch` and endpoints are injected. */
export interface NextAuthConfig {
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
  readonly session: ServerSession<typeof sessionSchema>
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
    },
    { crypto: defaultAuthCrypto(), clock: systemClock },
  )
  const session = createServerSession({
    adapter,
    signer,
    sessionSchema,
    toSessionValue: (result) => {
      const name = result.identity.claims.name
      return { subject: result.identity.subject, ...(typeof name === "string" ? { name } : {}) }
    },
    guard: { loginPath: LOGIN_PATH },
  })

  const read: ReadSession = async (cookieHeader) => {
    const value = await session.read(readOnlyJar(cookieHeader))
    return value === undefined
      ? ANONYMOUS_AUTH
      : { authenticated: true, subject: value.subject, name: value.name ?? null }
  }

  return { session, read }
}

/** A read-only jar over a `Cookie` header; `set` is unreachable on the read path. */
function readOnlyJar(cookieHeader: string): ServerSessionJar {
  const jar = parseCookieHeader(cookieHeader)
  return {
    get: (name) => jar.get(name),
    set: () => {
      throw new Error("read-only cookie jar cannot set cookies")
    },
  }
}

/** The auth capability — joins the neutral session read to the AppSnapshot under a stable id. */
export function authServerCapability(read: ReadSession): Capability<AuthSnapshot> {
  return defineCapability<AuthSnapshot>({
    id: AUTH_CAPABILITY_ID,
    resolve: ({ headers }) => read(headers.get("cookie") ?? ""),
  })
}
