import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { createMockIdp, createMockIdpStateCases, type MockIdpState } from "@plainworks/mocks/idp"
import Database from "better-sqlite3"
import { afterEach, describe, expect, test } from "vitest"
import { createSqliteMockIdpState } from "./idp-state"

const encryptionKey = new Uint8Array(32).fill(7)
const roots: string[] = []

function tempFile(): string {
  mkdirSync(".turbo", { recursive: true })
  const root = mkdtempSync(".turbo/custody-idp-")
  roots.push(root)
  return join(root, "fixture.sqlite")
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

// Every handle is an independent SQLite connection over one file.
function sqliteSubject() {
  const filename = tempFile()
  const handles: MockIdpState[] = []
  return {
    open() {
      const state = createSqliteMockIdpState({ filename, encryptionKey })
      handles.push(state)
      return state
    },
    dispose() {
      for (const state of handles) state.close()
    },
  }
}

describe("SQLite MockIdpState", () => {
  for (const c of createMockIdpStateCases()) test(c.name, () => c.run(sqliteSubject))

  test("rejects a different key and never stores the private key in plaintext", async () => {
    const filename = tempFile()
    const state = createSqliteMockIdpState({ filename, encryptionKey })
    try {
      const idp = await createMockIdp({ state })
      expect((await idp.fetch(`${idp.issuer}/jwks`)).status).toBe(200)
      expect(() =>
        createSqliteMockIdpState({ filename, encryptionKey: new Uint8Array(32).fill(8) }),
      ).toThrow()
    } finally {
      state.close()
    }
    expect(readFileSync(filename).includes(Buffer.from("privateJwk"))).toBe(false)
  })

  test("bounds lock contention instead of waiting on another writer", () => {
    const filename = tempFile()
    const state = createSqliteMockIdpState({ filename, encryptionKey })
    const lock = new Database(filename)
    try {
      lock.exec("BEGIN IMMEDIATE")
      expect(() => state.transact((data) => data.counter)).toThrow()
      lock.exec("ROLLBACK")
      expect(state.transact((data) => data.counter)).toBe(0)
    } finally {
      state.close()
      lock.close()
    }
  })
})
