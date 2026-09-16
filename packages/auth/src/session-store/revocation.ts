import { type Clock, systemClock } from "@plainworks/std"
import { AuthError } from "../errors"
import type { RevocationCheck, SessionEnvelope } from "./envelope"

const DEFAULT_MAX_ENTRIES = 10_000

/** How to build a {@link RevocationRegistry}. */
export interface RevocationRegistryOptions {
  /** Injected clock for deterministic expiry; defaults to {@link systemClock}. */
  readonly clock?: Clock
  /**
   * Hard cap on live revocations held in memory; defaults to 10_000. Admission is fail-closed: once
   * the cap is reached (after purging expired records), a new handle's `revoke` throws rather than
   * evicting a still-live revocation, so a full registry never silently re-authorizes a revoked
   * session. High-volume deployments back the check with a shared store instead.
   */
  readonly maxEntries?: number
}

/**
 * A revocation source keyed by the session handle (`sid`) an envelope carries. It bridges an
 * out-of-band invalidation — a sign-out everywhere, or a detected refresh-token reuse — to the
 * read-time {@link RevocationCheck} the session codec runs: once a handle is revoked, every cookie
 * bound to it fails verify-at-read with `auth/session-revoked`.
 *
 * A revocation is retained until the revoked session's own expiry (its envelope `exp`) and no
 * longer: past `exp` the cookie is already rejected as expired, so the record is safe to drop. A
 * record therefore cannot outlive the session it blocks, and memory is hard-capped by `maxEntries`
 * — expired records are purged on write and admission is fail-closed at the cap, so a live
 * revocation is never evicted to make room. A distributed deployment supplies its own shared-store
 * {@link RevocationCheck} instead.
 */
export interface RevocationRegistry<Value = unknown> {
  /** The read-time check to hand to the session codec's `isRevoked`. */
  readonly isRevoked: RevocationCheck<Value>
  /**
   * Revoke a session handle until `expiresAtSeconds` (the revoked envelope's absolute `exp`, in
   * epoch seconds) so its cookie is rejected on every read up to that instant.
   */
  revoke(sid: string, expiresAtSeconds: number): void
  /** Whether a handle is currently revoked and not yet past its retained expiry. */
  isRevokedSid(sid: string): boolean
}

/**
 * Build an in-memory {@link RevocationRegistry}. A factory, never a module-level singleton — but
 * because an in-memory revocation must outlive the single request that records it to reject a
 * later one, the composition root **retains one instance for the protected session lifetime** and
 * shares it between the adapter's reuse signal and the session codec's `isRevoked`. A distributed
 * deployment supplies its own {@link RevocationCheck} over a shared store (Redis/a database)
 * instead. Records self-expire at each session's `exp` and memory is hard-capped by `maxEntries`
 * (fail-closed admission), so the set stays bounded without ever dropping a live revocation.
 */
export function createRevocationRegistry<Value = unknown>(
  options: RevocationRegistryOptions = {},
): RevocationRegistry<Value> {
  const clock = options.clock ?? systemClock
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
  if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
    throw new AuthError(
      "auth/config",
      `revocation registry maxEntries must be a positive integer, got ${maxEntries}`,
    )
  }
  // sid -> absolute expiry in epoch seconds; an entry is live only while now < expiry.
  const revoked = new Map<string, number>()

  function nowSeconds(): number {
    return Math.floor(clock.now() / 1000)
  }

  function isLive(sid: string): boolean {
    const expiresAt = revoked.get(sid)
    if (expiresAt === undefined) {
      return false
    }
    if (nowSeconds() >= expiresAt) {
      revoked.delete(sid)
      return false
    }
    return true
  }

  function purgeExpired(): void {
    const now = nowSeconds()
    for (const [sid, expiresAt] of revoked) {
      if (now >= expiresAt) {
        revoked.delete(sid)
      }
    }
  }

  return {
    isRevoked(envelope: SessionEnvelope<Value>): boolean {
      return envelope.sid !== undefined && isLive(envelope.sid)
    },
    revoke(sid: string, expiresAtSeconds: number): void {
      if (!Number.isFinite(expiresAtSeconds)) {
        throw new AuthError(
          "auth/config",
          `revocation expiry must be a finite epoch-seconds value, got ${expiresAtSeconds}`,
        )
      }
      purgeExpired()
      const existing = revoked.get(sid)
      if (existing === undefined && revoked.size >= maxEntries) {
        // Fail closed: never evict a still-live revocation to admit a new one, since that would
        // re-authorize a revoked-but-unexpired session. A full registry surfaces the compromise
        // as an error instead — the caller must fall back to a shared store.
        throw new AuthError(
          "auth/session-revoked",
          `revocation registry is at capacity (${maxEntries}); cannot record a new revocation`,
        )
      }
      // Keep the furthest expiry so re-revoking never shortens an existing record's retention.
      revoked.set(
        sid,
        existing === undefined ? expiresAtSeconds : Math.max(existing, expiresAtSeconds),
      )
    },
    isRevokedSid(sid: string): boolean {
      return isLive(sid)
    },
  }
}
