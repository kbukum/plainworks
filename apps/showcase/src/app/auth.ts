// The showcase's authentication — the reference application authenticates through
// `@plainworks/auth`'s own `createServerSession` composition, never a hand-assembled cookie/signer/
// CSRF flow. This neutral (server) module assembles the OIDC Authorization Code + PKCE adapter and
// the HMAC session signer behind an injected `fetch` seam, resolves the session from the request
// cookie into the AppSnapshot so the dashboard can be gated, and exposes the read seam the SSR
// render consumes. React-free, and the IdP `fetch` is injected by the caller (the dev server / the
// smoke test), so the render graph never imports the dev/test provider.

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
import { AUTH_CAPABILITY_ID, LOGIN_PATH } from "./constants"

/** The value persisted in the signed session cookie — identity only, never a token. */
export interface ShowcaseSessionValue {
  readonly subject: string
  readonly name?: string
}

/** Resolve the client-safe auth slice from a request `Cookie` header. */
export type ReadShowcaseSession = (cookieHeader: string) => Promise<AuthSnapshot>

const sessionSchema: StandardSchemaV1<unknown, ShowcaseSessionValue> = guardSchema(
  (value): value is ShowcaseSessionValue =>
    isRecord(value) &&
    typeof value.subject === "string" &&
    isAbsentOr(value.name, (name) => typeof name === "string"),
  "session cookie payload is not a valid showcase session",
)

/** How to build the showcase's server session — the IdP `fetch` and endpoints are injected. */
export interface ShowcaseAuthConfig {
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

/** The showcase's assembled session flow plus the read seam the render consumes. */
export interface ShowcaseAuth {
  /** The package's session composition — drives `/login`, `/auth/callback`, `/logout`. */
  readonly session: ServerSession<typeof sessionSchema>
  /** Resolve the client-safe auth slice from a request `Cookie` header. */
  readonly read: ReadShowcaseSession
}

/**
 * Assemble the showcase's authentication through `@plainworks/auth` — an OIDC Authorization Code +
 * PKCE adapter and an HMAC session signer, composed by `createServerSession`. A per-request-safe
 * factory with no module-level singleton, so nothing is shared across requests.
 */
export function createShowcaseAuth(config: ShowcaseAuthConfig): ShowcaseAuth {
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

  const read: ReadShowcaseSession = async (cookieHeader) => {
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
export function authServerCapability(read: ReadShowcaseSession): Capability<AuthSnapshot> {
  return defineCapability<AuthSnapshot>({
    id: AUTH_CAPABILITY_ID,
    resolve: ({ headers }) => read(headers.get("cookie") ?? ""),
  })
}
