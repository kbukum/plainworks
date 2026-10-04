import { AuthError } from "@plainworks/auth"
import {
  decodeLoginRecord,
  decodeSessionMetadata,
  decodeSessionRecord,
  encodeSessionRecord,
  type MemorySessionStoreOptions,
  type OpaqueSessionStore,
} from "@plainworks/auth/server"
import { isPositiveInteger, isRecord } from "@plainworks/std"
import { systemClock } from "@plainworks/std/time"
import type { WebAbortSignal } from "@plainworks/std/web"
import { type CustodyDatabaseOptions, custodyFailure, openCustodyDatabase } from "./database"

/** Encrypted local SQLite sessions for one Node host. The caller closes it after its request. */
export interface SqliteSessionStore<Value> extends OpaqueSessionStore<Value> {
  close(): void
}

export interface SqliteSessionStoreOptions<Value>
  extends MemorySessionStoreOptions<Value>,
    Omit<CustodyDatabaseOptions, "maxPageCount"> {}

interface SessionRow {
  readonly reference: string
  readonly family: string
  readonly expires: number
  readonly payload: string
}

function sessionRow(value: unknown): SessionRow | undefined {
  if (value === undefined) return undefined
  if (
    !isRecord(value) ||
    typeof value.reference !== "string" ||
    typeof value.family !== "string" ||
    typeof value.expires !== "number" ||
    typeof value.payload !== "string"
  ) {
    throw new AuthError("auth/store-unavailable", "invalid SQLite session row")
  }
  return {
    reference: value.reference,
    family: value.family,
    expires: value.expires,
    payload: value.payload,
  }
}

export function createSqliteSessionStore<Value>(
  options: SqliteSessionStoreOptions<Value>,
): SqliteSessionStore<Value> {
  const clock = options.clock ?? systemClock
  const capacity = options.capacity ?? 1024
  const transactionCapacity = options.transactionCapacity ?? 256
  if (!isPositiveInteger(capacity) || !isPositiveInteger(transactionCapacity)) {
    throw new AuthError("auth/config", "invalid session capacity")
  }
  const custody = openCustodyDatabase(options)
  const db = custody.database
  const { cipher } = custody
  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS auth_sessions (
          reference TEXT PRIMARY KEY, family TEXT NOT NULL, expires INTEGER NOT NULL,
          payload TEXT NOT NULL, active INTEGER NOT NULL, revoked INTEGER NOT NULL,
          retain_until INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS auth_session_family ON auth_sessions(family);
        CREATE TABLE IF NOT EXISTS auth_logins (
          reference TEXT PRIMARY KEY, expires INTEGER NOT NULL, payload TEXT NOT NULL
        );
      `)
    }).immediate()
  } catch (cause) {
    custody.close()
    throw custodyFailure(cause)
  }
  function run<Result>(signal: WebAbortSignal | undefined, operation: () => Result): Result {
    signal?.throwIfAborted()
    try {
      if (!db.open) throw new AuthError("auth/store-unavailable", "SQLite session store is closed")
      return operation()
    } catch (cause) {
      throw custodyFailure(cause)
    }
  }
  function cleanup(): void {
    db.prepare("DELETE FROM auth_sessions WHERE retain_until <= ?").run(clock.now())
    db.prepare("DELETE FROM auth_logins WHERE expires <= ?").run(clock.now())
  }
  function live(reference: string): SessionRow | undefined {
    return sessionRow(
      db
        .prepare(
          "SELECT reference, family, expires, payload FROM auth_sessions WHERE reference = ? AND active = 1 AND revoked = 0 AND expires > ?",
        )
        .get(reference, clock.now()),
    )
  }
  return {
    close: custody.close,
    async read(reference, signal) {
      const row = run(signal, () => live(reference))
      if (row === undefined) return undefined
      const record = await decodeSessionRecord(
        cipher.open(`session:${reference}`, row.payload),
        options.schema,
      )
      if (record.reference !== row.reference || record.expiresAt !== row.expires) {
        throw new AuthError("auth/store-unavailable", "SQLite session metadata mismatch")
      }
      return run(signal, () => (live(reference)?.payload === row.payload ? record : undefined))
    },
    async create(record, previous, signal) {
      signal?.throwIfAborted()
      const owned = await decodeSessionRecord(encodeSessionRecord(record), options.schema)
      const payload = cipher.seal(`session:${owned.reference}`, encodeSessionRecord(owned))
      run(signal, () =>
        db
          .transaction(() => {
            cleanup()
            const old = previous === undefined ? undefined : live(previous)
            if (previous !== undefined && old === undefined) {
              throw new AuthError("auth/session-revoked", "login lost to a session mutation")
            }
            if (
              owned.expiresAt <= clock.now() ||
              owned.expiresAt > clock.now() + 3_600_000 ||
              (old !== undefined && old.expires !== owned.expiresAt)
            ) {
              throw new AuthError("auth/session-invalid", "invalid absolute session expiry")
            }
            const count: unknown = db.prepare("SELECT COUNT(*) FROM auth_sessions").pluck().get()
            if (typeof count !== "number" || count >= capacity) {
              throw new AuthError("auth/store-unavailable", "session storage capacity exhausted")
            }
            const family = old?.family ?? owned.reference
            if (old !== undefined) {
              db.prepare("UPDATE auth_sessions SET active = 0 WHERE reference = ?").run(
                old.reference,
              )
            }
            db.prepare(
              "INSERT INTO auth_sessions (reference, family, expires, payload, active, revoked, retain_until) VALUES (?, ?, ?, ?, 1, 0, ?)",
            ).run(owned.reference, family, owned.expiresAt, payload, owned.expiresAt + 600_000)
          })
          .immediate(),
      )
    },
    async revoke(reference, signal) {
      return run(signal, () =>
        db
          .transaction(() => {
            cleanup()
            const rows: unknown[] = db
              .prepare(
                "SELECT reference, family, expires, payload FROM auth_sessions WHERE family = (SELECT family FROM auth_sessions WHERE reference = ?)",
              )
              .all(reference)
            const handles = new Set<string>()
            for (const value of rows) {
              const row = sessionRow(value)
              if (row === undefined)
                throw new AuthError("auth/store-unavailable", "missing session row")
              const record = decodeSessionMetadata(
                cipher.open(`session:${row.reference}`, row.payload),
              )
              if (record.providerHandle !== undefined) handles.add(record.providerHandle)
            }
            db.prepare(
              "UPDATE auth_sessions SET revoked = 1 WHERE family = (SELECT family FROM auth_sessions WHERE reference = ?)",
            ).run(reference)
            return [...handles]
          })
          .immediate(),
      )
    },
    async createLogin(record, signal) {
      const owned = decodeLoginRecord(encodeSessionRecord(record))
      const payload = cipher.seal(`login:${owned.reference}`, encodeSessionRecord(owned))
      run(signal, () =>
        db
          .transaction(() => {
            cleanup()
            if (owned.expiresAt <= clock.now() || owned.expiresAt > clock.now() + 600_000) {
              throw new AuthError("auth/login-transaction", "invalid login transaction expiry")
            }
            const count: unknown = db.prepare("SELECT COUNT(*) FROM auth_logins").pluck().get()
            if (typeof count !== "number" || count >= transactionCapacity) {
              throw new AuthError("auth/store-unavailable", "login transaction capacity exhausted")
            }
            db.prepare(
              "INSERT INTO auth_logins (reference, expires, payload) VALUES (?, ?, ?)",
            ).run(owned.reference, owned.expiresAt, payload)
          })
          .immediate(),
      )
    },
    async consumeLogin(reference, signal) {
      return run(signal, () =>
        db
          .transaction(() => {
            cleanup()
            const payload: unknown = db
              .prepare("DELETE FROM auth_logins WHERE reference = ? RETURNING payload")
              .pluck()
              .get(reference)
            if (payload === undefined) return undefined
            if (typeof payload !== "string") {
              throw new AuthError("auth/store-unavailable", "invalid SQLite login row")
            }
            const record = decodeLoginRecord(cipher.open(`login:${reference}`, payload))
            if (record.reference !== reference) {
              throw new AuthError("auth/store-unavailable", "SQLite login metadata mismatch")
            }
            return record.expiresAt > clock.now() ? record : undefined
          })
          .immediate(),
      )
    },
  }
}
