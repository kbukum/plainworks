import { isPositiveInteger } from "@plainworks/std"
import { AuthError } from "../../errors"
import type { MemorySessionStoreOptions } from "./seam"

// The opaque-session rules every store enforces. Stores only persist; these pure checks decide
// what a store may accept, so a memory store and a database store cannot drift apart.

/** The longest a session generation may live; also the server session's `ttlSeconds` ceiling. */
export const MAX_SESSION_LIFETIME_MS = 3_600_000

/** The longest a login transaction may live; also the `transactionTtlSeconds` ceiling. */
export const MAX_LOGIN_LIFETIME_MS = 600_000

/**
 * How long a generation is kept after its expiry, so a replayed older generation is still found
 * and revokes its whole family instead of reading as unknown.
 */
export const REVOCATION_RETENTION_MS = 600_000

const DEFAULT_SESSION_CAPACITY = 1024
const DEFAULT_LOGIN_CAPACITY = 256

/** How many session generations (including retained ones) and login transactions a store holds. */
export interface SessionStoreCapacity {
  readonly sessions: number
  readonly logins: number
}

/**
 * Read a store's capacity options with their defaults (1024 sessions, 256 logins).
 *
 * @throws {AuthError} `auth/config` when either capacity is not a positive integer.
 */
export function sessionStoreCapacity(
  options: Pick<MemorySessionStoreOptions<unknown>, "capacity" | "transactionCapacity">,
): SessionStoreCapacity {
  const sessions = options.capacity ?? DEFAULT_SESSION_CAPACITY
  const logins = options.transactionCapacity ?? DEFAULT_LOGIN_CAPACITY
  if (!isPositiveInteger(sessions) || !isPositiveInteger(logins)) {
    throw new AuthError("auth/config", "invalid session capacity")
  }
  return { sessions, logins }
}

/** The live generation a rotation replaces, as the store holds it. */
export interface LiveGeneration {
  readonly family: string
  readonly expiresAt: number
}

/** What a store records for an admitted generation. */
export interface SessionAdmission {
  readonly family: string
  readonly retainUntil: number
}

/**
 * Decide whether a store may write a new session generation. `previous` is the reference the
 * login rotates from, and `current` is that generation if it is still live (active, not revoked,
 * not expired). A rotation keeps the family and the absolute expiry of the generation it replaces.
 *
 * @throws {AuthError} `auth/session-revoked` when `previous` is no longer live (the login lost a
 *   race with a logout or another rotation); `auth/session-invalid` for an expiry that is past,
 *   beyond {@link MAX_SESSION_LIFETIME_MS}, or different from the replaced generation's.
 */
export function admitSession(
  record: { readonly reference: string; readonly expiresAt: number },
  previous: string | undefined,
  current: LiveGeneration | undefined,
  now: number,
): SessionAdmission {
  if (previous !== undefined && current === undefined) {
    throw new AuthError("auth/session-revoked", "login lost to a session mutation")
  }
  if (
    !(record.expiresAt > now && record.expiresAt <= now + MAX_SESSION_LIFETIME_MS) ||
    (current !== undefined && record.expiresAt !== current.expiresAt)
  ) {
    throw new AuthError("auth/session-invalid", "invalid absolute session expiry")
  }
  return {
    family: current?.family ?? record.reference,
    retainUntil: record.expiresAt + REVOCATION_RETENTION_MS,
  }
}

/**
 * Decide whether a store may write a login transaction expiring at `expiresAt`.
 *
 * @throws {AuthError} `auth/login-transaction` for an expiry that is past or beyond
 *   {@link MAX_LOGIN_LIFETIME_MS}.
 */
export function admitLogin(expiresAt: number, now: number): void {
  if (!(expiresAt > now && expiresAt <= now + MAX_LOGIN_LIFETIME_MS)) {
    throw new AuthError("auth/login-transaction", "invalid login transaction expiry")
  }
}
