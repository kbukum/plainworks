import {
  type Clock,
  type InferSchemaOutput,
  isCookieNameToken,
  MAX_COOKIE_BYTES,
  type RedirectSignal,
  type StandardSchemaV1,
  serializeCookieAttributes,
  systemClock,
  utf8ByteLength,
  type WebAbortSignal,
} from "@plainworks/std"
import type { AuthAdapter, AuthSession } from "../adapter"
import { type AuthCrypto, defaultAuthCrypto } from "../crypto"
import { type CsrfProtection, createCsrf } from "../csrf"
import { AuthError } from "../errors"
import { type AuthGuardConfig, sanitizeReturnTo, unauthenticatedRedirect } from "../redirect"
import type { TokenSet } from "../session"
import {
  decodeSession,
  decodeSessionEnvelope,
  encodeSession,
  type RevocationCheck,
  type RevocationRegistry,
  type SessionCodec,
} from "../session-store"
import type { SessionSigner } from "../signer"
import { signPayload, verifyPayload } from "../signer"

/** How to build a {@link ServerSession} — the assembled BFF login/session flow. */
export interface ServerSessionConfig<Schema extends StandardSchemaV1> {
  /**
   * The authentication adapter driving the interactive flow (e.g. `oidcAdapter(...)`). Its
   * `beginLogin`/`completeLogin` are required; a stateless verifier without them is a configuration
   * error caught the first time a login is attempted.
   */
  readonly adapter: AuthAdapter
  /**
   * The server-owned signing key holder (the default `hmacSessionSigner`, or a BYO KMS signer).
   * One signer integrity-protects all three round-trip artifacts — the session cookie, the login
   * transaction, and the CSRF token — so they cannot be forged or swapped without the key.
   */
  readonly signer: SessionSigner
  /** Validates the persisted session value at read — the trust boundary over the cookie. */
  readonly sessionSchema: Schema
  /**
   * Map a completed login into the value persisted in the signed session cookie. Persist identity,
   * **never a token** — the access/refresh tokens stay in the adapter's per-request memory custody.
   */
  readonly toSessionValue: (session: AuthSession) => InferSchemaOutput<Schema>
  /** Where to send an unauthenticated caller; enables {@link ServerSession.guard}. */
  readonly guard?: AuthGuardConfig
  /** CSPRNG seam for the CSRF token's random half; defaults to Web Crypto. */
  readonly crypto?: AuthCrypto
  /** Time source for cookie stamps and expiry; defaults to {@link systemClock}. */
  readonly clock?: Clock
  /** Session cookie base name; stored as `__Host-<name>`. Defaults to `session`. */
  readonly cookieName?: string
  /** Absolute session lifetime in seconds (also the cookie `Max-Age`). Defaults to one hour. */
  readonly ttlSeconds?: number
  /** Optional freshness bound in seconds since `iat`; forwarded to the session codec. */
  readonly maxAgeSeconds?: number
  /** Clock-skew tolerance in seconds for a future `iat`; forwarded to the session codec. */
  readonly clockSkewSeconds?: number
  /** Optional revocation seam checked at read; forwarded to the session codec. */
  readonly isRevoked?: RevocationCheck<InferSchemaOutput<Schema>>
  /**
   * An app-scoped {@link RevocationRegistry} shared across requests. Wired in two directions for
   * secure-by-default revocation: its `isRevoked` is checked at every session read, and when the
   * adapter reports a refresh-token compromise (`auth/session-revoked`) the flow records the
   * session handle here so the signed cookie is rejected on its next read — closing the window
   * where a revoked-but-unexpired cookie would still authenticate. Must be retained for the
   * protected session lifetime (not rebuilt per request); a distributed deployment supplies a
   * shared-store `isRevoked` instead. Composed with an explicit `isRevoked` when both are given.
   */
  readonly revocation?: RevocationRegistry<InferSchemaOutput<Schema>>
  /** Login-transaction cookie base name; stored as `__Host-<name>`. Defaults to `login_tx`. */
  readonly transactionCookieName?: string
  /** How long the login transaction cookie lives, in seconds. Defaults to 600 (10 minutes). */
  readonly transactionTtlSeconds?: number
  /** CSRF cookie base name; stored as `__Host-<name>`. Defaults to `csrf`. */
  readonly csrfCookieName?: string
  /** Random bytes per CSRF token; forwarded to the CSRF factory. */
  readonly csrfByteLength?: number
}

/**
 * The request/response cookie surface the flow drives — read an inbound value, append a
 * `Set-Cookie`.
 */
export interface ServerSessionJar {
  /** The inbound value of cookie `name`, or `undefined` when absent. */
  get(name: string): string | undefined
  /** Append one serialized `Set-Cookie` entry. */
  set(setCookie: string): void
}

/** Options for beginning an interactive login. */
export interface ServerBeginLoginRequest {
  /** Where to return the caller after login — sanitized to a same-origin reference by the flow. */
  readonly returnTo?: string
  /** Cancellation for the adapter's discovery/authorization work. */
  readonly signal?: WebAbortSignal
}

/** Options for completing an interactive login from the provider callback. */
export interface ServerCompleteLoginRequest {
  /** The raw callback query parameters returned by the provider (`code`, `state`, ...). */
  readonly params: Readonly<Record<string, string>>
  /** Cancellation for the token exchange. */
  readonly signal?: WebAbortSignal
}

/** The instruction to redirect the user agent to the provider to begin login. */
export interface ServerBeginLoginResult {
  /** The provider authorization URL to redirect the user agent to. */
  readonly authorizationUrl: string
}

/** The result of a completed login — where to send the caller next, and the persisted session. */
export interface ServerCompleteLoginResult<Value> {
  /** The sanitized, same-origin destination captured at {@link ServerSession.beginLogin}. */
  readonly returnTo: string
  /** The session value now persisted in the signed cookie. */
  readonly session: Value
}

/**
 * The assembled server-side session flow: one object that reads/writes the hardened session cookie,
 * drives the adapter's redirect login, binds CSRF to the live session, and produces a route-guard
 * redirect. The package owns the whole flow — a consumer wires HTTP routes to these methods rather
 * than hand-assembling a codec, cookie jar, signer, and CSRF protection itself.
 */
export interface ServerSession<Schema extends StandardSchemaV1> {
  /**
   * Read and verify the session value from the request cookies, or `undefined` when there is no
   * session or the cookie fails verify-at-read (tampered, expired, revoked) — an invalid cookie is
   * uniformly unauthenticated, never an error the caller must catch.
   */
  read(jar: ServerSessionJar): Promise<InferSchemaOutput<Schema> | undefined>
  /**
   * A route guard: `null` when the caller is authenticated, or an {@link unauthenticatedRedirect}
   * signal to the configured login route otherwise. Requires `guard` config.
   */
  guard(jar: ServerSessionJar, currentPath?: string): Promise<RedirectSignal | null>
  /**
   * Begin an interactive login: persist the integrity-protected login transaction (PKCE/state/nonce
   * plus the return target) to a short-lived cookie and return the provider URL to redirect to.
   */
  beginLogin(
    jar: ServerSessionJar,
    request?: ServerBeginLoginRequest,
  ): Promise<ServerBeginLoginResult>
  /**
   * Complete login from the provider callback: verify the transaction cookie, exchange the code,
   * mint the signed session cookie and a session-bound CSRF cookie, clear the transaction cookie,
   * and return the captured return target.
   */
  completeLogin(
    jar: ServerSessionJar,
    request: ServerCompleteLoginRequest,
  ): Promise<ServerCompleteLoginResult<InferSchemaOutput<Schema>>>
  /** Clear the session, CSRF, and transaction cookies and tear down adapter session state. */
  logout(jar: ServerSessionJar, signal?: WebAbortSignal): Promise<void>
  /**
   * Refresh adapter credentials for the current session. Returns undefined when no valid
   * session cookie is present.
   */
  refresh(jar: ServerSessionJar, signal?: WebAbortSignal): Promise<TokenSet | undefined>
  /**
   * Verify a CSRF double-submit for the current session: the `__Host-` CSRF cookie against the
   * caller-echoed `requestToken`, both bound to the live session. `false` when there is no valid
   * session, either half is missing, they differ, or the token is not bound to this session.
   */
  verifyCsrf(jar: ServerSessionJar, requestToken: string): Promise<boolean>
}

interface TransactionEnvelope {
  /** The adapter's opaque, already-signed login transaction. */
  readonly t: string
  /** The sanitized return target captured at `beginLogin`. */
  readonly r: string
}

const DEFAULT_TTL_SECONDS = 3600
const DEFAULT_TRANSACTION_TTL_SECONDS = 600
const HOST_PREFIX = "__Host-"

function hostCookieName(base: string): string {
  const name = `${HOST_PREFIX}${base}`
  if (!isCookieNameToken(name)) {
    throw new AuthError("auth/config", `cookie name "${name}" is not a valid RFC 6265 token`)
  }
  return name
}

function isTransactionEnvelope(value: unknown): value is TransactionEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { t?: unknown }).t === "string" &&
    typeof (value as { r?: unknown }).r === "string"
  )
}

/**
 * Combine an explicit revocation seam with the shared registry's; a session is revoked if either
 * is.
 */
function composeRevocation<Value>(
  explicit: RevocationCheck<Value> | undefined,
  registry: RevocationCheck<Value> | undefined,
): RevocationCheck<Value> | undefined {
  if (explicit === undefined) {
    return registry
  }
  if (registry === undefined) {
    return explicit
  }
  return async (envelope) => (await explicit(envelope)) || (await registry(envelope))
}

/**
 * Assemble a {@link ServerSession}. A per-request factory — no import-time side effects and no
 * module-level singleton — so two concurrent requests never share custody. It composes the pieces
 * that already exist (the session codec, the signer, CSRF, the redirect guard) into the one flow a
 * BFF consumer needs, keeping the token-bearing seams (signer, adapter) on this server-only entry.
 */
export function createServerSession<Schema extends StandardSchemaV1>(
  config: ServerSessionConfig<Schema>,
): ServerSession<Schema> {
  const clock = config.clock ?? systemClock
  const crypto = config.crypto ?? defaultAuthCrypto()
  const signer = config.signer
  const ttlSeconds = config.ttlSeconds ?? DEFAULT_TTL_SECONDS
  const transactionTtlSeconds = config.transactionTtlSeconds ?? DEFAULT_TRANSACTION_TTL_SECONDS

  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new AuthError(
      "auth/config",
      `session ttlSeconds must be a positive integer, got ${ttlSeconds}`,
    )
  }
  if (!Number.isInteger(transactionTtlSeconds) || transactionTtlSeconds <= 0) {
    throw new AuthError(
      "auth/config",
      `session transactionTtlSeconds must be a positive integer, got ${transactionTtlSeconds}`,
    )
  }
  if (
    config.clockSkewSeconds !== undefined &&
    (!Number.isInteger(config.clockSkewSeconds) || config.clockSkewSeconds < 0)
  ) {
    throw new AuthError(
      "auth/config",
      `session clockSkewSeconds must be a non-negative integer, got ${config.clockSkewSeconds}`,
    )
  }
  if (
    config.maxAgeSeconds !== undefined &&
    (!Number.isInteger(config.maxAgeSeconds) || config.maxAgeSeconds <= 0)
  ) {
    throw new AuthError(
      "auth/config",
      `session maxAgeSeconds must be a positive integer, got ${config.maxAgeSeconds}`,
    )
  }

  const sessionName = hostCookieName(config.cookieName ?? "session")
  const transactionName = hostCookieName(config.transactionCookieName ?? "login_tx")
  const csrfName = hostCookieName(config.csrfCookieName ?? "csrf")

  // One read-time revocation check from the explicit seam and/or the shared registry — a session
  // is revoked when either says so.
  const revocationCheck = composeRevocation(config.isRevoked, config.revocation?.isRevoked)

  const codec: SessionCodec<Schema> = {
    signer,
    schema: config.sessionSchema,
    clock,
    ttlSeconds,
    ...(config.clockSkewSeconds === undefined ? {} : { clockSkewSeconds: config.clockSkewSeconds }),
    ...(config.maxAgeSeconds === undefined ? {} : { maxAgeSeconds: config.maxAgeSeconds }),
    ...(revocationCheck === undefined ? {} : { isRevoked: revocationCheck }),
  }
  const csrf: CsrfProtection = createCsrf({
    signer,
    crypto,
    ...(config.csrfByteLength === undefined ? {} : { byteLength: config.csrfByteLength }),
  })

  // The session cookie is SameSite=Strict + HttpOnly: never sent from a cross-site context and
  // never readable by script. The transaction cookie is SameSite=Lax + HttpOnly so it survives the
  // top-level redirect back from the provider. The CSRF cookie is Strict but readable by script
  // (not HttpOnly), so the client can echo it back as the double-submit header.
  const sessionAttributes = { path: "/", sameSite: "Strict", secure: true, httpOnly: true } as const
  const transactionAttributes = {
    path: "/",
    sameSite: "Lax",
    secure: true,
    httpOnly: true,
  } as const
  const csrfAttributes = { path: "/", sameSite: "Strict", secure: true, httpOnly: false } as const

  function writeCookie(
    jar: ServerSessionJar,
    name: string,
    value: string,
    attributes: { path: string; sameSite: "Strict" | "Lax"; secure: boolean; httpOnly: boolean },
    maxAgeSeconds: number,
  ): void {
    const entry = `${name}=${value}; ${serializeCookieAttributes({ ...attributes, maxAgeSeconds })}`
    if (utf8ByteLength(entry) > MAX_COOKIE_BYTES) {
      throw new AuthError(
        "auth/config",
        `cookie ${name} is ${utf8ByteLength(entry)} bytes, over the ~${MAX_COOKIE_BYTES}-byte limit`,
      )
    }
    jar.set(entry)
  }

  function clearCookie(
    jar: ServerSessionJar,
    name: string,
    attributes: { path: string; sameSite: "Strict" | "Lax"; secure: boolean; httpOnly: boolean },
  ): void {
    jar.set(`${name}=; ${serializeCookieAttributes({ ...attributes, maxAgeSeconds: 0 })}`)
  }

  function requireInteractive(): AuthAdapter {
    if (config.adapter.beginLogin === undefined || config.adapter.completeLogin === undefined) {
      throw new AuthError(
        "auth/config",
        "the configured adapter does not support an interactive login flow",
      )
    }
    return config.adapter
  }

  async function readSession(
    jar: ServerSessionJar,
  ): Promise<InferSchemaOutput<Schema> | undefined> {
    const raw = jar.get(sessionName)
    if (raw === undefined) {
      return undefined
    }
    try {
      return await decodeSession(codec, raw)
    } catch (error) {
      // Verify-at-read maps a tampered/expired/revoked cookie to the unauthenticated state; any
      // other failure (a genuine bug) still propagates.
      if (error instanceof AuthError && error.kind.startsWith("auth/session-")) {
        return undefined
      }
      throw error
    }
  }

  return {
    read: readSession,

    async guard(jar, currentPath) {
      if (config.guard === undefined) {
        throw new AuthError("auth/config", "guard() requires a `guard` route configuration")
      }
      const session = await readSession(jar)
      if (session !== undefined) {
        return null
      }
      return unauthenticatedRedirect(config.guard, currentPath)
    },

    async beginLogin(jar, request = {}) {
      const adapter = requireInteractive()
      const returnTo = sanitizeReturnTo(request.returnTo)
      const redirect = await adapter.beginLogin?.({
        returnTo,
        ...(request.signal ? { signal: request.signal } : {}),
      })
      if (redirect === undefined) {
        throw new AuthError("auth/adapter", "adapter beginLogin produced no redirect")
      }
      const envelope: TransactionEnvelope = { t: redirect.transaction, r: returnTo }
      writeCookie(
        jar,
        transactionName,
        await signPayload(signer, envelope),
        transactionAttributes,
        transactionTtlSeconds,
      )
      return { authorizationUrl: redirect.authorizationUrl }
    },

    async completeLogin(jar, request) {
      const adapter = requireInteractive()
      const raw = jar.get(transactionName)
      if (raw === undefined) {
        throw new AuthError("auth/adapter", "no login transaction cookie is present")
      }
      const envelope = await verifyPayload(signer, raw)
      if (!isTransactionEnvelope(envelope)) {
        throw new AuthError("auth/adapter", "login transaction cookie failed verification")
      }
      const authSession = await adapter.completeLogin?.({
        params: request.params,
        transaction: envelope.t,
        ...(request.signal ? { signal: request.signal } : {}),
      })
      if (authSession === undefined) {
        throw new AuthError("auth/adapter", "adapter completeLogin produced no session")
      }
      const value = config.toSessionValue(authSession)
      const sessionCookieValue = await encodeSession(codec, value, authSession.sessionHandle)
      writeCookie(jar, sessionName, sessionCookieValue, sessionAttributes, ttlSeconds)
      clearCookie(jar, transactionName, transactionAttributes)
      // Bind the CSRF token to the exact session cookie value: a token minted for one session never
      // verifies once the session rotates, and the binding needs no field from the session schema.
      const csrfToken = await csrf.issue(sessionCookieValue)
      writeCookie(jar, csrfName, csrfToken, csrfAttributes, ttlSeconds)
      return { returnTo: sanitizeReturnTo(envelope.r), session: value }
    },

    async logout(jar, signal) {
      const raw = jar.get(sessionName)
      let sid: string | undefined
      if (raw !== undefined) {
        try {
          const env = await decodeSessionEnvelope(codec, raw)
          sid = env.sid
        } catch {
          // ignore corrupted/expired cookie on logout
        }
      }
      clearCookie(jar, sessionName, sessionAttributes)
      clearCookie(jar, csrfName, csrfAttributes)
      clearCookie(jar, transactionName, transactionAttributes)
      await config.adapter.logout?.(signal, sid)
    },

    async refresh(jar, signal) {
      const raw = jar.get(sessionName)
      if (raw === undefined) {
        return undefined
      }
      let env: Awaited<ReturnType<typeof decodeSessionEnvelope>>
      try {
        env = await decodeSessionEnvelope(codec, raw)
      } catch (error) {
        if (error instanceof AuthError && error.kind.startsWith("auth/session-")) {
          return undefined
        }
        throw error
      }
      if (env.sid === undefined) {
        return undefined
      }
      try {
        return await config.adapter.refresh?.(signal, env.sid)
      } catch (error) {
        // The adapter detected a refresh-token compromise mid-flight. Record the handle in the
        // shared registry so this session's cookie is rejected on its next read — retained only to
        // its own expiry — then report no refresh. Without a writable revocation path the cookie
        // cannot be invalidated here, so the compromise stays visible rather than being swallowed.
        if (error instanceof AuthError && error.kind === "auth/session-revoked") {
          if (config.revocation === undefined) {
            throw error
          }
          config.revocation.revoke(env.sid, env.exp)
          return undefined
        }
        if (error instanceof AuthError && error.kind.startsWith("auth/session-")) {
          return undefined
        }
        throw error
      }
    },

    async verifyCsrf(jar, requestToken) {
      const sessionCookieValue = jar.get(sessionName)
      if (sessionCookieValue === undefined) {
        return false
      }
      // A CSRF token is only trusted against a session that itself verifies at read.
      if ((await readSession(jar)) === undefined) {
        return false
      }
      return csrf.verify(sessionCookieValue, jar.get(csrfName) ?? "", requestToken)
    },
  }
}
