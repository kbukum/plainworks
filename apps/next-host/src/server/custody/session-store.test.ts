import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { guardSchema } from "@plainworks/std/seam"
import { manualClock } from "@plainworks/testkit"
import Database from "better-sqlite3"
import { afterEach, expect, test } from "vitest"
import { createSqliteRefreshTokenStore } from "./refresh-store"
import { createSqliteSessionStore } from "./session-store"

const schema = guardSchema((value): value is string => typeof value === "string")
const encryptionKey = new Uint8Array(32).fill(1)
const roots: string[] = []
function filename(): string {
  mkdirSync(".turbo", { recursive: true })
  const root = mkdtempSync(".turbo/custody-")
  roots.push(root)
  return join(root, "private", "sessions.sqlite")
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

test("independent connections share one-winner replacement, revocation and login consume", async () => {
  const file = filename()
  const clock = manualClock(0)
  const one = createSqliteSessionStore({ filename: file, encryptionKey, schema, clock })
  const two = createSqliteSessionStore({ filename: file, encryptionKey, schema, clock })
  try {
    await one.create({ reference: "a", value: "identity", expiresAt: 1000, providerHandle: "p" })
    const results = await Promise.allSettled([
      one.create({ reference: "b", value: "identity", expiresAt: 1000 }, "a"),
      two.create({ reference: "c", value: "identity", expiresAt: 1000 }, "a"),
    ])
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"])
    expect(await two.revoke("a")).toEqual(["p"])
    expect(await one.read("b")).toBeUndefined()
    expect(await one.read("c")).toBeUndefined()
    await one.createLogin({ reference: "l", transaction: "pkce", returnTo: "/", expiresAt: 1000 })
    const consumed = await Promise.all([one.consumeLogin("l"), two.consumeLogin("l")])
    expect(consumed.filter((r) => r !== undefined)).toHaveLength(1)
  } finally {
    one.close()
    two.close()
  }
})

test("restart keeps live sessions encrypted and a different key fails closed", async () => {
  const file = filename()
  const first = createSqliteSessionStore({
    filename: file,
    encryptionKey,
    schema,
    clock: manualClock(0),
  })
  await first.create({ reference: "a", value: "secret-identity", expiresAt: 1000 })
  first.close()
  await expect(first.read("a")).rejects.toMatchObject({ kind: "auth/store-unavailable" })
  const reopened = createSqliteSessionStore({
    filename: file,
    encryptionKey,
    schema,
    clock: manualClock(0),
  })
  try {
    expect((await reopened.read("a"))?.value).toBe("secret-identity")
  } finally {
    reopened.close()
  }
  expect(readFileSync(file).includes(Buffer.from("secret-identity"))).toBe(false)
  expect(() =>
    createSqliteSessionStore({
      filename: file,
      encryptionKey: new Uint8Array(32).fill(2),
      schema,
    }),
  ).toThrow(/mismatch/)
})

test("lock contention fails within the 50 ms busy budget instead of blocking", async () => {
  const file = filename()
  const store = createSqliteSessionStore({
    filename: file,
    encryptionKey,
    schema,
    clock: manualClock(0),
  })
  const lock = new Database(file)
  try {
    lock.exec("BEGIN IMMEDIATE")
    const started = performance.now()
    await expect(
      store.create({ reference: "a", value: "v", expiresAt: 1000 }),
    ).rejects.toMatchObject({ kind: "auth/store-unavailable" })
    expect(performance.now() - started).toBeLessThan(500)
    lock.exec("ROLLBACK")
    await store.create({ reference: "a", value: "v", expiresAt: 1000 })
  } finally {
    lock.close()
    store.close()
  }
})

test("refresh rotation across connections has one winner", async () => {
  const file = filename()
  const one = createSqliteRefreshTokenStore({ filename: file, encryptionKey })
  const two = createSqliteRefreshTokenStore({ filename: file, encryptionKey })
  try {
    await one.issue("h", "rt-1")
    const results = await Promise.all([one.rotate("h", "rt-1", "a"), two.rotate("h", "rt-1", "b")])
    expect(results.filter((r) => r.status === "rotated")).toHaveLength(1)
    expect(await one.current("h")).toBeUndefined()
  } finally {
    one.close()
    two.close()
  }
})
