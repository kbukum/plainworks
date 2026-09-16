import { type Clock, systemClock } from "@plainworks/std"
import { constantTimeEqual } from "../../crypto/constant-time"
import { AuthError } from "../../errors"

/**
 * The outcome of presenting a refresh token for rotation. `rotated` means the presented token was
 * the live one and has been replaced by `next`; `reuse-detected` means an already-consumed (or
 * unknown) token was presented — the signature of a stolen, replayed credential — so the whole
 * session family is purged and the caller must deny the refresh and revoke the session.
 */
export type RefreshRotation = { readonly status: "rotated" } | { readonly status: "reuse-detected" }

/**
 * Server-side custody for a session's refresh token with **automatic reuse detection** (the OAuth
 * 2.0 Security BCP, RFC 9700 §4.14.2). It holds the one live refresh token per opaque session
 * handle and replaces it on every refresh, so a token the legitimate client already rotated past is
 * no longer the live one — presenting it is caught as a replay. It never custodies an access token
 * (that stays in the adapter's request memory) and it is injected, so a deployment can back it with
 * Redis/a database instead of the in-memory default.
 */
export interface RefreshTokenStore {
  /** Custody the initial refresh token minted at login. */
  issue(handle: string, token: string): void | Promise<void>
  /** The live refresh token to present to the provider, or `undefined` when none is held. */
  current(handle: string): string | undefined | Promise<string | undefined>
  /**
   * Rotate the token: the caller presents the token it just used and the provider's replacement.
   * Returns `rotated` when the presented token was the live one, or `reuse-detected` when it was
   * not — a superseded token replayed after the legitimate client rotated, or an unknown one.
   */
  rotate(
    handle: string,
    presented: string,
    next: string,
  ): RefreshRotation | Promise<RefreshRotation>
  /** Drop all custody for a handle — a logout, or the family purge after a detected reuse. */
  revoke(handle: string): void | Promise<void>
}

/** Options for {@link createRefreshTokenStore}. */
export interface RefreshTokenStoreOptions {
  /** Lifetime of a stored refresh token in seconds; defaults to 86_400 (24 hours). */
  readonly ttlSeconds?: number
  /** Maximum number of sessions held before evicting the oldest; defaults to 10_000. */
  readonly maxEntries?: number
  /** Injected clock for deterministic testing; defaults to {@link systemClock}. */
  readonly clock?: Clock
}

const DEFAULT_TTL_SECONDS = 86_400
const DEFAULT_MAX_ENTRIES = 10_000
const encoder = new TextEncoder()

interface TokenEntry {
  current: string
  expiresAt: number
}

function requirePositiveInt(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new AuthError(
      "auth/config",
      `refresh token store ${field} must be a positive integer, got ${value}`,
    )
  }
}

/**
 * Build a server-side in-memory {@link RefreshTokenStore} with TTL expiry, bounded session
 * capacity, and reuse detection. A factory, never a module-level singleton, so token custody is
 * never shared across requests by accident.
 */
export function createRefreshTokenStore(options: RefreshTokenStoreOptions = {}): RefreshTokenStore {
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
  const clock = options.clock ?? systemClock

  requirePositiveInt(ttlSeconds, "ttlSeconds")
  requirePositiveInt(maxEntries, "maxEntries")

  const entries = new Map<string, TokenEntry>()

  function purgeExpired(now: number): void {
    for (const [key, entry] of entries) {
      if (now >= entry.expiresAt) {
        entries.delete(key)
      }
    }
  }

  function liveEntry(handle: string): TokenEntry | undefined {
    const entry = entries.get(handle)
    if (entry === undefined) {
      return undefined
    }
    if (clock.now() >= entry.expiresAt) {
      entries.delete(handle)
      return undefined
    }
    return entry
  }

  return {
    issue(handle: string, token: string): void {
      const now = clock.now()
      if (entries.size >= maxEntries && !entries.has(handle)) {
        purgeExpired(now)
      }
      if (entries.size >= maxEntries && !entries.has(handle)) {
        const oldest = entries.keys().next().value
        if (oldest !== undefined) {
          entries.delete(oldest)
        }
      }
      entries.set(handle, { current: token, expiresAt: now + ttlSeconds * 1000 })
    },

    current(handle: string): string | undefined {
      return liveEntry(handle)?.current
    },

    rotate(handle: string, presented: string, next: string): RefreshRotation {
      const entry = liveEntry(handle)
      if (entry === undefined) {
        // No live custody: nothing legitimate to rotate, so treat the attempt as a replay.
        return { status: "reuse-detected" }
      }
      // Only the one live token rotates. Any other token — a superseded one the legitimate client
      // already rotated past, or an unknown one — is a replay: purge the whole family so no token
      // in it can be used again.
      if (!constantTimeEqual(encoder.encode(presented), encoder.encode(entry.current))) {
        entries.delete(handle)
        return { status: "reuse-detected" }
      }
      entry.current = next
      entry.expiresAt = clock.now() + ttlSeconds * 1000
      return { status: "rotated" }
    },

    revoke(handle: string): void {
      entries.delete(handle)
    },
  }
}
