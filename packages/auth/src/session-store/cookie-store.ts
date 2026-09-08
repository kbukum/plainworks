import {
  type Clock,
  type InferSchemaOutput,
  isCookieNameToken,
  MAX_COOKIE_BYTES,
  type StandardSchemaV1,
  type StateCapabilities,
  type StateSource,
  type Subscription,
  serializeCookieAttributes,
  systemClock,
  utf8ByteLength,
} from "@plainworks/std"
import { AuthError } from "../errors"
import type { SessionSigner } from "../signer/seam"
import { decodeSession, encodeSession, type SessionCodec } from "./envelope"

/**
 * The request/response cookie surface the server session store drives — read the inbound cookie value
 * by name, append an outbound `Set-Cookie` entry. Injected so a host binds it to its own
 * `Request`/`Response` (Next route handler, Node http, an edge fetch handler) with no assumption about
 * which one. Distinct from the client `document.cookie` jar in `@plainworks/state`: this side mints
 * `HttpOnly` cookies a script can never read.
 */
export interface SessionCookieJar {
  /** The inbound value of cookie `name`, or `undefined` when absent. */
  get(name: string): string | undefined
  /** Append one serialized `Set-Cookie` entry (`__Host-name=value; attrs`). */
  set(setCookie: string): void
}

/** How to build the server `__Host-` session cookie store. */
export interface CookieSessionStoreConfig<Schema extends StandardSchemaV1> {
  /** The bound request/response cookie jar. */
  readonly jar: SessionCookieJar
  /** The integrity signer (the server-owned `hmacSessionSigner` by default). */
  readonly signer: SessionSigner
  /** Validates the decoded session value at read. */
  readonly schema: Schema
  /** The base cookie name; the stored cookie is `__Host-<name>`. Defaults to `session`. */
  readonly cookieName?: string
  /** Absolute session lifetime in seconds; also the cookie `Max-Age`. Defaults to one hour. */
  readonly ttlSeconds?: number
  /** Injected clock; defaults to {@link systemClock}. */
  readonly clock?: Clock
}

const DEFAULT_TTL_SECONDS = 3600
const HOST_PREFIX = "__Host-"

// A server-owned session cookie: transmitted to the server (`sentToServer`), durable across reloads,
// not observable across tabs, and never available at import (a host request must be present). It is
// deliberately `sentToServer: true` — that is what a cookie *is* — yet it is exempt from the client
// secret guard because custody is server-side and the value is `HttpOnly`: no client scope ever reads
// it, so the "secret only in memory" rule (which protects *client*-readable scopes) does not apply.
const COOKIE_SESSION_CAPABILITIES: StateCapabilities = {
  access: "sync",
  authority: "local",
  durable: true,
  sharedAcrossTabs: false,
  sentToServer: true,
  availableAtImport: false,
}

/**
 * Build the default **server** session store: a {@link StateSource} whose backend is a `__Host-`
 * prefixed, `Secure` + `HttpOnly` + `SameSite=Strict` + `Path=/` (no `Domain`) cookie carrying a
 * signed, integrity-protected session value.
 *
 * - `get` reads the cookie and runs verify-at-read ({@link decodeSession}): a tampered/unsigned/
 *   malformed cookie throws `auth/session-invalid`, an expired one throws `auth/session-expired`, and
 *   an absent cookie is `undefined` — a caller is never handed a fabricated session.
 * - `set` signs and writes the cookie, refusing a value that would exceed the ~4KB cookie budget with
 *   a typed `auth/config` error rather than letting the browser silently drop it.
 * - `remove` clears the cookie (logout invalidation).
 *
 * Every mutation notifies this store's own subscribers; a cookie has no cross-tab change event.
 */
export function createCookieSessionStore<Schema extends StandardSchemaV1>(
  config: CookieSessionStoreConfig<Schema>,
): StateSource<InferSchemaOutput<Schema>> {
  const baseName = config.cookieName ?? "session"
  const name = `${HOST_PREFIX}${baseName}`
  if (!isCookieNameToken(name)) {
    throw new AuthError(
      "auth/config",
      `session cookie name "${name}" is not a valid RFC 6265 token`,
    )
  }
  const codec: SessionCodec<Schema> = {
    signer: config.signer,
    schema: config.schema,
    clock: config.clock ?? systemClock,
    ttlSeconds: config.ttlSeconds ?? DEFAULT_TTL_SECONDS,
  }
  if (!Number.isInteger(codec.ttlSeconds) || codec.ttlSeconds <= 0) {
    throw new AuthError(
      "auth/config",
      `session ttlSeconds must be a positive integer, got ${codec.ttlSeconds}`,
    )
  }
  // `__Host-` requires Secure + Path=/ + no Domain; SameSite=Strict + HttpOnly complete the custody.
  const attributes = serializeCookieAttributes({
    path: "/",
    sameSite: "Strict",
    secure: true,
    httpOnly: true,
    maxAgeSeconds: codec.ttlSeconds,
  })
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of listeners) {
      listener()
    }
  }

  return {
    capabilities: COOKIE_SESSION_CAPABILITIES,
    async get(): Promise<InferSchemaOutput<Schema> | undefined> {
      const raw = config.jar.get(name)
      if (raw === undefined) {
        return undefined
      }
      return decodeSession(codec, raw)
    },
    async set(value: InferSchemaOutput<Schema>): Promise<void> {
      const cookieValue = await encodeSession(codec, value)
      const entry = `${name}=${cookieValue}; ${attributes}`
      const bytes = utf8ByteLength(entry)
      if (bytes > MAX_COOKIE_BYTES) {
        throw new AuthError(
          "auth/config",
          `session cookie is ${bytes} bytes, over the ~${MAX_COOKIE_BYTES}-byte limit`,
        )
      }
      config.jar.set(entry)
      notify()
    },
    async remove(): Promise<void> {
      // Clear by writing the same `__Host-` cookie empty with Max-Age=0 (Secure + Path=/ retained).
      const clearAttributes = serializeCookieAttributes({
        path: "/",
        sameSite: "Strict",
        secure: true,
        httpOnly: true,
        maxAgeSeconds: 0,
      })
      config.jar.set(`${name}=; ${clearAttributes}`)
      notify()
    },
    subscribe(onChange: () => void): Subscription {
      listeners.add(onChange)
      return {
        unsubscribe: () => {
          listeners.delete(onChange)
        },
      }
    },
  }
}
