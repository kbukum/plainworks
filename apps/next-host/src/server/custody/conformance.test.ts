import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import {
  createOpaqueSessionStoreCases,
  createRefreshTokenStoreCases,
} from "@plainworks/auth/testing"
import { afterEach, describe, test } from "vitest"
import { createSqliteRefreshTokenStore } from "./refresh-store"
import { createSqliteSessionStore } from "./session-store"

const key = new Uint8Array(32).fill(1)
const roots: string[] = []
function filename(): string {
  mkdirSync(".turbo", { recursive: true })
  const root = mkdtempSync(".turbo/custody-")
  roots.push(root)
  return join(root, "private", "store.sqlite")
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe("SQLite OpaqueSessionStore conformance", () => {
  for (const c of createOpaqueSessionStoreCases()) {
    test(c.name, () =>
      c.run((options) => {
        const store = createSqliteSessionStore({
          ...options,
          filename: filename(),
          encryptionKey: key,
        })
        return { store, close: () => store.close() }
      }),
    )
  }
})

describe("SQLite RefreshTokenStore conformance", () => {
  for (const c of createRefreshTokenStoreCases()) {
    test(c.name, () =>
      c.run((options) => {
        const store = createSqliteRefreshTokenStore({
          ...options,
          filename: filename(),
          encryptionKey: key,
        })
        return { store, close: () => store.close() }
      }),
    )
  }
})
