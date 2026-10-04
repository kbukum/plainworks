import { AuthError } from "@plainworks/auth"
import { constantTimeEqual } from "@plainworks/auth/crypto"
import {
  type RefreshTokenStore,
  type RefreshTokenStoreOptions,
  validateRefreshHandle,
  validateRefreshToken,
} from "@plainworks/auth/server"
import { isPositiveInteger, isRecord } from "@plainworks/std"
import { systemClock } from "@plainworks/std/time"
import type { WebAbortSignal } from "@plainworks/std/web"
import { type CustodyDatabaseOptions, custodyFailure, openCustodyDatabase } from "./database"

export interface SqliteRefreshTokenStoreOptions
  extends RefreshTokenStoreOptions,
    Omit<CustodyDatabaseOptions, "maxPageCount"> {}

export interface SqliteRefreshTokenStore extends RefreshTokenStore {
  close(): void
}

interface RefreshRow {
  readonly payload: string | null
  readonly expires: number
}

function refreshRow(value: unknown): RefreshRow | undefined {
  if (value === undefined) return undefined
  if (
    !isRecord(value) ||
    (value.payload !== null && typeof value.payload !== "string") ||
    typeof value.expires !== "number"
  ) {
    throw new AuthError("auth/store-unavailable", "invalid SQLite refresh row")
  }
  return { payload: value.payload, expires: value.expires }
}

/** Authoritative refresh custody with transactional rotation and retained revocation. */
export function createSqliteRefreshTokenStore(
  options: SqliteRefreshTokenStoreOptions,
): SqliteRefreshTokenStore {
  const clock = options.clock ?? systemClock
  const ttl = options.ttlSeconds ?? 3600
  const capacity = options.maxEntries ?? 10_000
  if (!isPositiveInteger(ttl) || !isPositiveInteger(capacity)) {
    throw new AuthError("auth/config", "invalid provider custody lifetime or capacity")
  }
  const custody = openCustodyDatabase(options)
  const db = custody.database
  const { cipher } = custody
  const encoder = new TextEncoder()
  try {
    db.exec(
      "CREATE TABLE IF NOT EXISTS auth_refresh (handle TEXT PRIMARY KEY, payload TEXT, expires INTEGER NOT NULL)",
    )
  } catch (cause) {
    custody.close()
    throw custodyFailure(cause)
  }
  function run<Result>(signal: WebAbortSignal | undefined, operation: () => Result): Result {
    signal?.throwIfAborted()
    try {
      if (!db.open) throw new AuthError("auth/store-unavailable", "SQLite refresh store is closed")
      return db.transaction(operation).immediate()
    } catch (cause) {
      throw custodyFailure(cause)
    }
  }
  function cleanup(): void {
    db.prepare("DELETE FROM auth_refresh WHERE expires <= ?").run(clock.now())
  }
  function row(handle: string): RefreshRow | undefined {
    return refreshRow(
      db
        .prepare("SELECT payload, expires FROM auth_refresh WHERE handle = ? AND expires > ?")
        .get(handle, clock.now()),
    )
  }
  function admit(): void {
    const count: unknown = db.prepare("SELECT COUNT(*) FROM auth_refresh").pluck().get()
    if (typeof count !== "number" || count >= capacity) {
      throw new AuthError("auth/store-unavailable", "provider custody capacity exhausted")
    }
  }
  return {
    close: custody.close,
    issue(handle, token, signal) {
      validateRefreshHandle(handle)
      validateRefreshToken(token)
      run(signal, () => {
        cleanup()
        if (row(handle) !== undefined) {
          throw new AuthError("auth/session-revoked", "provider custody handle is already used")
        }
        admit()
        db.prepare("INSERT INTO auth_refresh (handle, payload, expires) VALUES (?, ?, ?)").run(
          handle,
          cipher.seal(`refresh:${handle}`, token),
          clock.now() + ttl * 1000,
        )
      })
    },
    current(handle, signal) {
      return run(signal, () => {
        const found = row(handle)
        return found?.payload == null ? undefined : cipher.open(`refresh:${handle}`, found.payload)
      })
    },
    rotate(handle, presented, next, signal) {
      validateRefreshToken(next)
      return run(signal, () => {
        cleanup()
        const found = row(handle)
        if (found?.payload == null) return { status: "reuse-detected" }
        const current = cipher.open(`refresh:${handle}`, found.payload)
        if (!constantTimeEqual(encoder.encode(presented), encoder.encode(current))) {
          db.prepare("UPDATE auth_refresh SET payload = NULL WHERE handle = ?").run(handle)
          return { status: "reuse-detected" }
        }
        db.prepare("UPDATE auth_refresh SET payload = ? WHERE handle = ?").run(
          cipher.seal(`refresh:${handle}`, next),
          handle,
        )
        return { status: "rotated" }
      })
    },
    revoke(handle, signal) {
      validateRefreshHandle(handle)
      run(signal, () => {
        cleanup()
        if (row(handle) !== undefined) {
          db.prepare("UPDATE auth_refresh SET payload = NULL WHERE handle = ?").run(handle)
        } else {
          admit()
          db.prepare("INSERT INTO auth_refresh (handle, payload, expires) VALUES (?, NULL, ?)").run(
            handle,
            clock.now() + ttl * 1000,
          )
        }
      })
    },
  }
}
