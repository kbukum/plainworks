// The host owns the shared opaque session store and provider transport. This React-free module
// composes OIDC login and request-cookie lookup without importing the dev/test provider.
// The HMAC signer protects CSRF and login transactions; identity stays in the server store.

import { isAuthErrorKind } from "@plainworks/auth"
import { defaultAuthCrypto } from "@plainworks/auth/crypto"
import {
  createRequestJar,
  createServerSession,
  hmacSessionSigner,
  type OpaqueSessionStore,
  oidcAdapter,
  type ServerSession,
  type ServerSessionJar,
} from "@plainworks/auth/server"
import { ANONYMOUS_AUTH, type AuthSnapshot } from "@plainworks/auth/session"
import { isAbsentOr, isRecord } from "@plainworks/std"
import { guardSchema, type StandardSchemaV1 } from "@plainworks/std/seam"
import { systemClock } from "@plainworks/std/time"
import type { WebFetch } from "@plainworks/std/web"
import { LOGIN_PATH } from "../constants"

/** Identity persisted in the injected server store, never in a browser cookie. */
export interface ShowcaseSessionValue {
  readonly subject: string
  readonly name?: string
}

/** Resolve the client-safe auth slice from a request `Cookie` header. */
export type ReadShowcaseSession = (cookieHeader: string) => Promise<AuthSnapshot>

export const showcaseSessionSchema: StandardSchemaV1<unknown, ShowcaseSessionValue> = guardSchema(
  (value): value is ShowcaseSessionValue =>
    isRecord(value) &&
    typeof value.subject === "string" &&
    isAbsentOr(value.name, (name) => typeof name === "string"),
  "persisted identity is not a valid showcase session",
)

/** How to build the showcase's server session — the IdP `fetch` and endpoints are injected. */
export interface ShowcaseAuthConfig {
  readonly store: OpaqueSessionStore<ShowcaseSessionValue>
  /** The OIDC provider's `fetch` seam (the dev/test mock IdP), kept out of the render graph. */
  readonly fetch: WebFetch
  /** The provider issuer URL. */
  readonly issuer: string
  /** The registered client id. */
  readonly clientId: string
  /** The absolute redirect URI the provider calls back. */
  readonly redirectUri: string
  /** The process-owned key for CSRF proofs and OIDC login transactions. */
  readonly signingKey: Uint8Array
}

/** The showcase's assembled session flow plus the read seam the render consumes. */
export interface ShowcaseAuth {
  /** The package's session composition — drives `/login`, `/auth/callback`, `/auth/logout`. */
  readonly session: ServerSession<typeof showcaseSessionSchema>
  /** Resolve the client-safe auth slice from a request `Cookie` header. */
  readonly read: ReadShowcaseSession
}

/**
 * Assemble the host-owned session flow. Requests share the injected session authority and the
 * adapter's provider custody; request cookies and response headers remain request-local.
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
    sessionSchema: showcaseSessionSchema,
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

  const read: ReadShowcaseSession = async (cookieHeader) => {
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
