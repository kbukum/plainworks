import { isPositiveInteger } from "@plainworks/std"
import { systemClock } from "@plainworks/std/time"
import { AuthError } from "../../errors"
import { decodeLoginRecord, decodeSessionRecord, encodeSessionRecord } from "./record"
import type { MemorySessionStoreOptions, OpaqueSessionStore, StoredLogin } from "./seam"

/** Bounded single-process default. Distributed hosts inject transactional persistence instead. */
export function createMemorySessionStore<Value>(
  options: MemorySessionStoreOptions<Value>,
): OpaqueSessionStore<Value> {
  const clock = options.clock ?? systemClock
  const capacity = options.capacity ?? 1024
  const transactionCapacity = options.transactionCapacity ?? 256
  if (!isPositiveInteger(capacity) || !isPositiveInteger(transactionCapacity)) {
    throw new AuthError("auth/config", "invalid session capacity")
  }
  interface Entry {
    readonly serialized: string
    readonly expiresAt: number
    readonly providerHandle?: string
    readonly family: string
    active: boolean
    revoked: boolean
    retainUntil: number
  }
  const records = new Map<string, Entry>()
  const transactions = new Map<string, StoredLogin>()
  function cleanup(): void {
    for (const [reference, entry] of records) {
      if (entry.retainUntil <= clock.now()) records.delete(reference)
    }
    for (const [reference, entry] of transactions) {
      if (entry.expiresAt <= clock.now()) transactions.delete(reference)
    }
  }
  return {
    async read(reference, signal) {
      signal?.throwIfAborted()
      cleanup()
      const entry = records.get(reference)
      if (!entry?.active || entry.revoked || entry.expiresAt <= clock.now()) return undefined
      const record = await decodeSessionRecord(entry.serialized, options.schema)
      signal?.throwIfAborted()
      return entry.active && !entry.revoked && entry.expiresAt > clock.now() ? record : undefined
    },
    async create(record, previous, signal) {
      signal?.throwIfAborted()
      const encoded = encodeSessionRecord(record)
      const owned = await decodeSessionRecord(encoded, options.schema)
      const serialized = encodeSessionRecord(owned)
      signal?.throwIfAborted()
      cleanup()
      const old = previous === undefined ? undefined : records.get(previous)
      if (
        previous !== undefined &&
        (old === undefined || !old.active || old.revoked || old.expiresAt <= clock.now())
      ) {
        throw new AuthError("auth/session-revoked", "login lost to a session mutation")
      }
      if (
        owned.expiresAt <= clock.now() ||
        owned.expiresAt > clock.now() + 3_600_000 ||
        (old !== undefined && owned.expiresAt !== old.expiresAt)
      ) {
        throw new AuthError("auth/session-invalid", "invalid absolute session expiry")
      }
      if (records.size >= capacity || records.has(owned.reference)) {
        throw new AuthError("auth/store-unavailable", "session storage capacity exhausted")
      }
      const family = old?.family ?? owned.reference
      if (old !== undefined) old.active = false
      const retainUntil = owned.expiresAt + 600_000
      for (const entry of records.values()) {
        if (entry.family === family) entry.retainUntil = Math.max(entry.retainUntil, retainUntil)
      }
      records.set(owned.reference, {
        serialized,
        expiresAt: owned.expiresAt,
        ...(owned.providerHandle === undefined ? {} : { providerHandle: owned.providerHandle }),
        family,
        active: true,
        revoked: false,
        retainUntil,
      })
    },
    async revoke(reference, signal) {
      signal?.throwIfAborted()
      cleanup()
      const found = records.get(reference)
      if (found === undefined) return []
      const handles = new Set<string>()
      for (const entry of records.values()) {
        if (entry.family === found.family) {
          entry.revoked = true
          if (entry.providerHandle !== undefined) handles.add(entry.providerHandle)
        }
      }
      return [...handles]
    },
    async createLogin(record, signal) {
      signal?.throwIfAborted()
      const owned = decodeLoginRecord(encodeSessionRecord(record))
      if (owned.expiresAt <= clock.now() || owned.expiresAt > clock.now() + 600_000) {
        throw new AuthError("auth/login-transaction", "invalid login transaction expiry")
      }
      cleanup()
      if (transactions.size >= transactionCapacity || transactions.has(owned.reference)) {
        throw new AuthError("auth/store-unavailable", "login transaction capacity exhausted")
      }
      transactions.set(owned.reference, owned)
    },
    async consumeLogin(reference, signal) {
      signal?.throwIfAborted()
      cleanup()
      const value = transactions.get(reference)
      transactions.delete(reference)
      return value
    },
  }
}
