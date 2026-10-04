import { AuthError } from "@plainworks/auth"
import Database from "better-sqlite3"
import { type Cipher, createCipher } from "./cipher"
import { privateFile } from "./files"

export interface CustodyDatabaseOptions {
  readonly filename: string
  /** A private 32-byte key from the composition root. Never stored in SQLite. */
  readonly encryptionKey: Uint8Array
  /** SQLite page cap (4 KiB pages); bounds database and WAL growth. Default 65536. */
  readonly maxPageCount?: number
}

/** An encrypted SQLite connection. The caller owns it and closes it after its request. */
export interface CustodyDatabase {
  readonly database: Database.Database
  readonly cipher: Cipher
  close(): void
}

const MARKER = "plainworks-custody:1"

export function custodyFailure(cause: unknown): AuthError {
  return cause instanceof AuthError
    ? cause
    : new AuthError("auth/store-unavailable", "custody operation failed", { cause })
}

function opensMarker(cipher: Cipher, stored: unknown): boolean {
  if (typeof stored !== "string") return false
  try {
    return cipher.open("custody:key", stored) === MARKER
  } catch {
    return false
  }
}

/**
 * Open with a 50 ms busy wait, WAL, full sync, a page cap, and secure delete. A stored marker
 * proves the key matches existing data, so a wrong key fails closed instead of minting new state.
 */
export function openCustodyDatabase(options: CustodyDatabaseOptions): CustodyDatabase {
  const cipher = createCipher(options.encryptionKey)
  let database: Database.Database | undefined
  try {
    privateFile(options.filename)
    database = new Database(options.filename, { timeout: 50 })
    const db = database
    db.pragma("journal_mode = WAL")
    db.pragma("synchronous = FULL")
    db.pragma(`max_page_count = ${options.maxPageCount ?? 65_536}`)
    db.pragma("secure_delete = ON")
    db.transaction(() => {
      db.exec(
        "CREATE TABLE IF NOT EXISTS custody_key (id INTEGER PRIMARY KEY, value TEXT NOT NULL)",
      )
      const existing: unknown = db
        .prepare("SELECT value FROM custody_key WHERE id = 1")
        .pluck()
        .get()
      if (existing === undefined) {
        db.prepare("INSERT INTO custody_key (id, value) VALUES (1, ?)").run(
          cipher.seal("custody:key", MARKER),
        )
      } else if (!opensMarker(cipher, existing)) {
        throw new AuthError("auth/config", "custody key or storage format mismatch")
      }
    }).immediate()
    return {
      database: db,
      cipher,
      close() {
        if (db.open) db.close()
        cipher.close()
      },
    }
  } catch (cause) {
    database?.close()
    cipher.close()
    throw custodyFailure(cause)
  }
}
