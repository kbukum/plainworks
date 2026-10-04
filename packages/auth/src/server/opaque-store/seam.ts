import type { StandardSchemaV1 } from "@plainworks/std/seam"
import type { Clock } from "@plainworks/std/time"
import type { WebAbortSignal } from "@plainworks/std/web"

/** Persisted server-side data. `reference` is a digest, never a credential. */
export interface StoredSession<Value> {
  readonly reference: string
  readonly value: Value
  readonly expiresAt: number
  readonly providerHandle?: string
}

/** OIDC transaction custody. The browser receives only a separate random opaque handle. */
export interface StoredLogin {
  readonly reference: string
  readonly transaction: string
  readonly returnTo: string
  readonly previous?: string
  readonly expiresAt: number
}

/** Atomic persistence with bounded JSON values validated on admission and read. */
export interface OpaqueSessionStore<Value> {
  /** Expired and revoked generations are never readable, even while retained for logout. */
  read(reference: string, signal?: WebAbortSignal): Promise<StoredSession<Value> | undefined>
  /** Replace requires a live generation and preserves its family and absolute expiry. */
  create(record: StoredSession<Value>, previous?: string, signal?: WebAbortSignal): Promise<void>
  /** Revoke the family atomically and return its server-only provider custody handles. */
  revoke(reference: string, signal?: WebAbortSignal): Promise<readonly string[]>
  createLogin(record: StoredLogin, signal?: WebAbortSignal): Promise<void>
  /** Atomic one-time consumption; never return an expired transaction. */
  consumeLogin(reference: string, signal?: WebAbortSignal): Promise<StoredLogin | undefined>
}

export interface MemorySessionStoreOptions<Value> {
  readonly schema: StandardSchemaV1<unknown, Value>
  readonly clock?: Clock
  /** Physical generations including tombstones; default 1024. No live session eviction. */
  readonly capacity?: number
  readonly transactionCapacity?: number
}
