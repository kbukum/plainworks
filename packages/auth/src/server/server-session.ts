import { isErr, isPositiveInteger } from "@plainworks/std"
import { base64urlEncode } from "@plainworks/std/encoding"
import { type Delay, withTimeout } from "@plainworks/std/resilience"
import type {
  InferSchemaOutput,
  RedirectSignal,
  SessionIdentity,
  StandardSchemaV1,
} from "@plainworks/std/seam"
import { validateWithSchema } from "@plainworks/std/seam"
import { type Clock, systemClock } from "@plainworks/std/time"
import { serializeCookieAttributes, type WebAbortSignal } from "@plainworks/std/web"
import type { AuthAdapter, AuthSession, ProviderTokens } from "../adapter/seam"
import { type AuthCrypto, defaultAuthCrypto } from "../crypto"
import { createCsrf } from "../csrf"
import { AuthError } from "../errors"
import { type AuthGuardConfig, sanitizeReturnTo, unauthenticatedRedirect } from "../redirect"
import type { SessionResponse } from "../session"
import type { SessionSigner } from "../signer"
import type { OpaqueSessionStore, StoredSession } from "./opaque-store"

export interface ServerSessionConfig<Schema extends StandardSchemaV1> {
  readonly adapter: AuthAdapter
  /** Signs the short-lived OIDC transaction and CSRF; never signs an identity cookie. */
  readonly signer: SessionSigner
  readonly store: OpaqueSessionStore<InferSchemaOutput<Schema>>
  readonly sessionSchema: Schema
  readonly toSessionValue: (session: AuthSession) => InferSchemaOutput<Schema>
  readonly toIdentity: (value: InferSchemaOutput<Schema>) => SessionIdentity
  readonly guard?: AuthGuardConfig
  readonly crypto?: AuthCrypto
  readonly clock?: Clock
  readonly delay?: Delay
  readonly ttlSeconds?: number
  readonly transactionTtlSeconds?: number
}

export interface ServerSessionJar {
  get(name: string): string | undefined
  set(setCookie: string): void
}
export interface ServerBeginLoginRequest {
  readonly returnTo?: string
  readonly signal?: WebAbortSignal
}
export interface ServerCompleteLoginRequest {
  readonly params: Readonly<Record<string, string>>
  readonly signal?: WebAbortSignal
}
export interface ServerBeginLoginResult {
  readonly authorizationUrl: string
}
export interface ServerCompleteLoginResult<Value> {
  readonly returnTo: string
  readonly session: Value
}

/** One opaque server session owner. OIDC credentials remain in the provider's server custody. */
export interface ServerSession<Schema extends StandardSchemaV1> {
  read(jar: ServerSessionJar): Promise<InferSchemaOutput<Schema> | undefined>
  /** Published browser status response. Does not set or renew cookies. */
  status(jar: ServerSessionJar): Promise<SessionResponse>
  guard(jar: ServerSessionJar, currentPath?: string): Promise<RedirectSignal | null>
  beginLogin(
    jar: ServerSessionJar,
    request?: ServerBeginLoginRequest,
  ): Promise<ServerBeginLoginResult>
  completeLogin(
    jar: ServerSessionJar,
    request: ServerCompleteLoginRequest,
  ): Promise<ServerCompleteLoginResult<InferSchemaOutput<Schema>>>
  logout(jar: ServerSessionJar, signal?: WebAbortSignal): Promise<void>
  /** Provider token refresh is server-only, never an HTTP browser refresh protocol. */
  refreshProvider(
    jar: ServerSessionJar,
    signal?: WebAbortSignal,
  ): Promise<ProviderTokens | undefined>
  /** Rejects inactive sessions; returns false only for an invalid proof on an active session. */
  verifyCsrf(jar: ServerSessionJar, requestToken: string): Promise<boolean>
  /** Logout may revoke a family through a retained terminal generation. */
  verifyLogoutCsrf(jar: ServerSessionJar, requestToken: string): Promise<boolean>
}

export function createServerSession<Schema extends StandardSchemaV1>(
  config: ServerSessionConfig<Schema>,
): ServerSession<Schema> {
  const clock = config.clock ?? systemClock
  const crypto = config.crypto ?? defaultAuthCrypto()
  const ttl = config.ttlSeconds ?? 3600
  const transactionTtl = config.transactionTtlSeconds ?? 600
  if (
    !isPositiveInteger(ttl) ||
    ttl > 3600 ||
    !isPositiveInteger(transactionTtl) ||
    transactionTtl > 600
  ) {
    throw new AuthError("auth/config", "invalid session or transaction lifetime")
  }
  const csrf = createCsrf({ signer: config.signer, crypto })
  const sessionName = "__Host-session"
  const transactionName = "__Host-login_tx"
  const attributes = { path: "/", sameSite: "Strict", secure: true, httpOnly: true } as const
  const transactionAttributes = { ...attributes, sameSite: "Lax" } as const
  const encode = new TextEncoder()

  function bounded<T>(
    budget: number,
    signal: WebAbortSignal | undefined,
    operation: (signal: WebAbortSignal) => Promise<T>,
  ): Promise<T> {
    return withTimeout(operation, budget, {
      ...(signal === undefined ? {} : { signal }),
      ...(config.delay === undefined ? {} : { delay: config.delay }),
    })
  }

  async function reference(
    jar: ServerSessionJar,
    name = sessionName,
    domain = "session",
  ): Promise<string | undefined> {
    const raw = jar.get(name)
    if (raw === undefined) return undefined
    if (raw.length !== 43 || !/^[A-Za-z0-9_-]{43}$/.test(raw) || !/[AEIMQUYcgkosw048]$/.test(raw)) {
      throw new AuthError(
        name === sessionName ? "auth/session-invalid" : "auth/login-transaction",
        "invalid opaque credential",
      )
    }
    return base64urlEncode(await crypto.digestSha256(encode.encode(`${domain}.${raw}`)))
  }

  async function record(
    jar: ServerSessionJar,
    signal?: WebAbortSignal,
  ): Promise<StoredSession<InferSchemaOutput<Schema>> | undefined> {
    const ref = await reference(jar)
    if (ref === undefined) return undefined
    const found = await config.store.read(ref, signal)
    if (found === undefined) return undefined
    if (found.reference !== ref || !Number.isFinite(found.expiresAt)) {
      throw new AuthError("auth/session-invalid", "corrupt persisted session")
    }
    if (found.expiresAt <= clock.now()) return undefined
    const checked = await validateWithSchema(config.sessionSchema, found.value)
    if (isErr(checked)) {
      throw new AuthError("auth/session-invalid", "corrupt persisted identity")
    }
    return found
  }

  // Release every provider slot of a revoked family; one failed release never skips the others.
  async function releaseProviders(
    handles: readonly string[],
    signal: WebAbortSignal,
  ): Promise<void> {
    const logout = config.adapter.logout
    if (logout === undefined || handles.length === 0) return
    const results = await Promise.allSettled(
      handles.map((sessionHandle) => logout({ sessionHandle, signal })),
    )
    const failures = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    )
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) {
      throw new AuthError("auth/store-unavailable", "provider logout failed", {
        cause: new AggregateError(failures),
      })
    }
  }

  async function read(jar: ServerSessionJar): Promise<InferSchemaOutput<Schema> | undefined> {
    return bounded(500, undefined, async (signal) => (await record(jar, signal))?.value)
  }

  return {
    read,
    async status(jar) {
      return bounded(500, undefined, async (signal) => {
        const found = await record(jar, signal)
        if (found === undefined) throw new AuthError("auth/unauthenticated", "no active session")
        return {
          status: "authenticated",
          identity: config.toIdentity(found.value),
          expiresAt: new Date(found.expiresAt).toISOString(),
          csrfToken: await csrf.issue(found.reference),
        }
      })
    },
    async guard(jar, currentPath) {
      if (config.guard === undefined)
        throw new AuthError("auth/config", "guard configuration required")
      return (await read(jar)) === undefined
        ? unauthenticatedRedirect(config.guard, currentPath)
        : null
    },
    async beginLogin(jar, request = {}) {
      return bounded(5000, request.signal, async (signal) => {
        if (config.adapter.beginLogin === undefined) {
          throw new AuthError("auth/config", "interactive adapter required")
        }
        let previous = await reference(jar)
        // Authoritative failures are not a missing session; admission always performs the read.
        if (previous !== undefined && (await config.store.read(previous, signal)) === undefined) {
          await releaseProviders(await config.store.revoke(previous, signal), signal)
          previous = undefined
        }
        const returnTo = sanitizeReturnTo(request.returnTo)
        const result = await config.adapter.beginLogin({ returnTo, signal })
        const transactionHandle = base64urlEncode(crypto.randomBytes(32))
        const transactionReference = base64urlEncode(
          await crypto.digestSha256(encode.encode(`login.${transactionHandle}`)),
        )
        await config.store.createLogin(
          {
            reference: transactionReference,
            transaction: result.transaction,
            returnTo,
            ...(previous === undefined ? {} : { previous }),
            expiresAt: clock.now() + transactionTtl * 1000,
          },
          signal,
        )
        jar.set(
          `${transactionName}=${transactionHandle}; ${serializeCookieAttributes({
            ...transactionAttributes,
            maxAgeSeconds: transactionTtl,
          })}`,
        )
        return { authorizationUrl: result.authorizationUrl }
      })
    },
    async completeLogin(jar, request) {
      return bounded(5000, request.signal, async (signal) => {
        if (config.adapter.completeLogin === undefined) {
          throw new AuthError("auth/config", "interactive adapter required")
        }
        jar.set(
          `${transactionName}=; ${serializeCookieAttributes({
            ...transactionAttributes,
            maxAgeSeconds: 0,
          })}`,
        )
        const ref = await reference(jar, transactionName, "login")
        const transaction =
          ref === undefined ? undefined : await config.store.consumeLogin(ref, signal)
        if (
          transaction === undefined ||
          transaction.expiresAt <= clock.now() ||
          transaction.reference !== ref
        ) {
          throw new AuthError("auth/login-transaction", "invalid or expired login transaction")
        }
        const result = await config.adapter.completeLogin({
          params: request.params,
          transaction: transaction.transaction,
          signal,
        })
        try {
          const value = config.toSessionValue(result)
          const rawCredential = base64urlEncode(crypto.randomBytes(32))
          const sessionReference = base64urlEncode(
            await crypto.digestSha256(encode.encode(`session.${rawCredential}`)),
          )
          const previous = transaction.previous
          const previousRecord =
            previous === undefined ? undefined : await config.store.read(previous, signal)
          const expiresAt =
            previousRecord !== undefined && previousRecord.expiresAt > clock.now()
              ? previousRecord.expiresAt
              : clock.now() + ttl * 1000
          await config.store.create(
            {
              reference: sessionReference,
              value,
              expiresAt,
              ...(result.sessionHandle === undefined
                ? {}
                : { providerHandle: result.sessionHandle }),
            },
            previous,
            signal,
          )
          jar.set(
            `${sessionName}=${rawCredential}; ${serializeCookieAttributes({
              ...attributes,
              maxAgeSeconds: Math.max(1, Math.floor((expiresAt - clock.now()) / 1000)),
            })}`,
          )
          return { returnTo: sanitizeReturnTo(transaction.returnTo), session: value }
        } catch (cause) {
          const sessionHandle = result.sessionHandle
          if (sessionHandle !== undefined) {
            try {
              await bounded(2000, undefined, (cleanupSignal) =>
                releaseProviders([sessionHandle], cleanupSignal),
              )
            } catch (cleanupCause) {
              throw new AuthError(
                "auth/store-unavailable",
                "session admission and provider cleanup failed",
                {
                  cause: new AggregateError([cause, cleanupCause]),
                },
              )
            }
          }
          throw cause
        }
      })
    },
    async logout(jar, signal) {
      return bounded(2000, signal, async (boundedSignal) => {
        const ref = await reference(jar)
        const handles = ref === undefined ? [] : await config.store.revoke(ref, boundedSignal)
        // Cookie deletion only follows committed family revocation.
        jar.set(
          `${sessionName}=; ${serializeCookieAttributes({ ...attributes, maxAgeSeconds: 0 })}`,
        )
        await releaseProviders(handles, boundedSignal)
      })
    },
    async refreshProvider(jar, signal) {
      return bounded(2000, signal, async (boundedSignal) => {
        const found = await record(jar, boundedSignal)
        const sessionHandle = found?.providerHandle
        if (found === undefined || sessionHandle === undefined) return undefined
        try {
          const tokens = await config.adapter.refresh?.({ sessionHandle, signal: boundedSignal })
          // Logout commits the opaque revocation before it releases provider custody, so the
          // family is the final authority on whether a refreshed credential may be returned.
          const current = await record(jar, boundedSignal)
          if (current?.reference !== found.reference || current.providerHandle !== sessionHandle) {
            throw new AuthError("auth/session-revoked", "session was revoked during refresh")
          }
          return tokens
        } catch (cause) {
          if (cause instanceof AuthError && cause.kind === "auth/session-revoked") {
            const handles = await config.store.revoke(found.reference, boundedSignal)
            try {
              await releaseProviders(handles, boundedSignal)
            } catch (cleanupCause) {
              throw new AuthError("auth/session-revoked", "provider release failed", {
                cause: new AggregateError([cause, cleanupCause]),
              })
            }
          }
          throw cause
        }
      })
    },
    async verifyCsrf(jar, requestToken) {
      return bounded(500, undefined, async (signal) => {
        const found = await record(jar, signal)
        if (found === undefined) throw new AuthError("auth/unauthenticated", "no active session")
        return (
          requestToken.length <= 256 &&
          (await csrf.verify(found.reference, requestToken, requestToken))
        )
      })
    },
    async verifyLogoutCsrf(jar, requestToken) {
      return bounded(500, undefined, async () => {
        const ref = await reference(jar)
        return (
          ref !== undefined &&
          requestToken.length <= 256 &&
          (await csrf.verify(ref, requestToken, requestToken))
        )
      })
    },
  }
}
