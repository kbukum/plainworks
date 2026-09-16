import { type Clock, systemClock } from "@plainworks/std"
import { AuthError } from "../../errors"
import type { SessionTokenStore } from "./config"

/** Options for {@link createMemoryTokenStore}. */
export interface MemoryTokenStoreOptions {
  /** Lifetime of a stored refresh token in seconds; defaults to 86_400 (24 hours). */
  readonly ttlSeconds?: number
  /** Maximum number of sessions held in memory before evicting the oldest; defaults to 10_000. */
  readonly maxEntries?: number
  /** Injected clock for deterministic testing; defaults to {@link systemClock}. */
  readonly clock?: Clock
}

const DEFAULT_TTL_SECONDS = 86_400
const DEFAULT_MAX_ENTRIES = 10_000

interface TokenEntry {
  readonly token: string
  readonly expiresAt: number
}

/**
 * Build a server-side in-memory per-session token store with TTL-based expiration and bounded
 * capacity. Expired entries are discarded on read or during capacity sweeps; when full, the oldest
 * session is evicted to prevent unbounded memory growth on long-running servers.
 */
export function createMemoryTokenStore(options: MemoryTokenStoreOptions = {}): SessionTokenStore {
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
  const clock = options.clock ?? systemClock

  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new AuthError(
      "auth/config",
      `tokenStore ttlSeconds must be a positive integer, got ${ttlSeconds}`,
    )
  }
  if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
    throw new AuthError(
      "auth/config",
      `tokenStore maxEntries must be a positive integer, got ${maxEntries}`,
    )
  }

  const entries = new Map<string, TokenEntry>()

  function purgeExpired(now: number): void {
    for (const [key, entry] of entries) {
      if (now >= entry.expiresAt) {
        entries.delete(key)
      }
    }
  }

  return {
    get(sessionId: string): string | undefined {
      const entry = entries.get(sessionId)
      if (entry === undefined) {
        return undefined
      }
      const now = clock.now()
      if (now >= entry.expiresAt) {
        entries.delete(sessionId)
        return undefined
      }
      return entry.token
    },

    set(sessionId: string, token: string): void {
      const now = clock.now()
      if (entries.size >= maxEntries && !entries.has(sessionId)) {
        purgeExpired(now)
      }
      if (entries.size >= maxEntries && !entries.has(sessionId)) {
        const oldestKey = entries.keys().next().value
        if (oldestKey !== undefined) {
          entries.delete(oldestKey)
        }
      }
      entries.set(sessionId, {
        token,
        expiresAt: now + ttlSeconds * 1000,
      })
    },

    delete(sessionId: string): void {
      entries.delete(sessionId)
    },
  }
}
