import { isPositiveInteger } from "@plainworks/std"
import { type Clock, systemClock } from "@plainworks/std/time"
import type { WebAbortSignal } from "@plainworks/std/web"
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
  issue(handle: string, token: string, signal?: WebAbortSignal): void | Promise<void>
  /** The live refresh token to present to the provider, or `undefined` when none is held. */
  current(handle: string, signal?: WebAbortSignal): string | undefined | Promise<string | undefined>
  /**
   * Rotate the token: the caller presents the token it just used and the provider's replacement.
   * Returns `rotated` when the presented token was the live one, or `reuse-detected` when it was
   * not — a superseded token replayed after the legitimate client rotated, or an unknown one.
   */
  rotate(
    handle: string,
    presented: string,
    next: string,
    signal?: WebAbortSignal,
  ): RefreshRotation | Promise<RefreshRotation>
  /** Drop all custody for a handle — a logout, or the family purge after a detected reuse. */
  revoke(handle: string, signal?: WebAbortSignal): void | Promise<void>
}

/** Options for {@link createRefreshTokenStore}. */
export interface RefreshTokenStoreOptions {
  /** Absolute lifetime of refresh custody in seconds; defaults to 3600 (one hour). */
  readonly ttlSeconds?: number
  /** Maximum physical entries, including revoked handles; defaults to 10_000. Never evicts live state. */
  readonly maxEntries?: number
  /** Injected clock for deterministic testing; defaults to {@link systemClock}. */
  readonly clock?: Clock
}

const DEFAULT_TTL_SECONDS = 3600
const DEFAULT_MAX_ENTRIES = 10_000
const encoder = new TextEncoder()

interface TokenEntry {
  current: string | undefined
  expiresAt: number
}

function requirePositiveInt(value: number, field: string): void {
  if (!isPositiveInteger(value)) {
    throw new AuthError(
      "auth/config",
      `refresh token store ${field} must be a positive integer, got ${value}`,
    )
  }
}

export function validateRefreshHandle(handle: string): void {
  if (handle.length === 0 || handle.length > 128) {
    throw new AuthError("auth/refresh-failed", "invalid provider custody handle")
  }
}

export function validateRefreshToken(token: string): void {
  if (token.length === 0 || token.length > 16_384) {
    throw new AuthError("auth/refresh-failed", "invalid provider refresh credential")
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
    issue(handle: string, token: string, signal?: WebAbortSignal): void {
      signal?.throwIfAborted()
      validateRefreshHandle(handle)
      validateRefreshToken(token)
      const now = clock.now()
      purgeExpired(now)
      if (entries.has(handle)) {
        throw new AuthError("auth/session-revoked", "provider custody handle is already used")
      }
      if (entries.size >= maxEntries && !entries.has(handle)) {
        purgeExpired(now)
      }
      if (entries.size >= maxEntries && !entries.has(handle)) {
        throw new AuthError("auth/store-unavailable", "provider custody capacity exhausted")
      }
      entries.set(handle, { current: token, expiresAt: now + ttlSeconds * 1000 })
    },

    current(handle: string, signal?: WebAbortSignal): string | undefined {
      signal?.throwIfAborted()
      return liveEntry(handle)?.current
    },

    rotate(
      handle: string,
      presented: string,
      next: string,
      signal?: WebAbortSignal,
    ): RefreshRotation {
      signal?.throwIfAborted()
      validateRefreshToken(next)
      const entry = liveEntry(handle)
      if (entry?.current === undefined) {
        // No live custody: nothing legitimate to rotate, so treat the attempt as a replay.
        return { status: "reuse-detected" }
      }
      // Only the one live token rotates. Any other token — a superseded one the legitimate client
      // already rotated past, or an unknown one — is a replay: purge the whole family so no token
      // in it can be used again.
      if (!constantTimeEqual(encoder.encode(presented), encoder.encode(entry.current))) {
        entry.current = undefined
        return { status: "reuse-detected" }
      }
      entry.current = next
      return { status: "rotated" }
    },

    revoke(handle: string, signal?: WebAbortSignal): void {
      signal?.throwIfAborted()
      validateRefreshHandle(handle)
      purgeExpired(clock.now())
      const entry = entries.get(handle)
      if (entry !== undefined) {
        entry.current = undefined
      } else {
        if (entries.size >= maxEntries) {
          throw new AuthError("auth/store-unavailable", "provider custody capacity exhausted")
        }
        entries.set(handle, { current: undefined, expiresAt: clock.now() + ttlSeconds * 1000 })
      }
    },
  }
}
