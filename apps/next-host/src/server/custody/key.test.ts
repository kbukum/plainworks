import { execFile } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { promisify } from "node:util"
import { afterEach, expect, test } from "vitest"
import { deriveKey, resolveRootKey } from "./key"

const roots: string[] = []
function fixture(): string {
  mkdirSync(".turbo", { recursive: true })
  const root = mkdtempSync(".turbo/key-test-")
  roots.push(root)
  return root
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

test("initializes one private key and retains it on restart without leaking partial files", () => {
  const root = fixture()
  const filename = join(root, "private", "root.key")
  const first = resolveRootKey({ filename, allowCreate: true })
  expect(resolveRootKey({ filename, allowCreate: true })).toEqual(first)
  expect(first).toHaveLength(32)
  expect(statSync(join(root, "private")).mode & 0o777).toBe(0o700)
  expect(statSync(filename).mode & 0o777).toBe(0o600)
  expect(readdirSync(join(root, "private"))).toEqual(["root.key"])
  expect(deriveKey(first, "session")).not.toEqual(deriveKey(first, "fixture"))
})

test("requires production configuration and rejects mismatched, missing and truncated keys", () => {
  const root = fixture()
  const filename = join(root, "root.key")
  expect(() => resolveRootKey({ filename })).toThrow(/configured/)
  const key = resolveRootKey({ filename, allowCreate: true })
  expect(() =>
    resolveRootKey({ filename, configured: Buffer.alloc(32, 9).toString("base64url") }),
  ).toThrow(/mismatch/)
  expect(resolveRootKey({ filename, configured: Buffer.from(key).toString("base64url") })).toEqual(
    key,
  )
  writeFileSync(filename, "short", { mode: 0o600 })
  expect(() => resolveRootKey({ filename, allowCreate: true })).toThrow(/32-byte/)
  rmSync(filename)
  writeFileSync(join(root, "sessions.sqlite"), "", { mode: 0o600 })
  expect(() => resolveRootKey({ filename, allowCreate: true })).toThrow(/existing/)
  expect(() => resolveRootKey({ filename, configured: "not-a-key" })).toThrow(/32-byte/)
})

test("independent first-run processes atomically publish the same complete key", async () => {
  const root = fixture()
  const filename = join(root, "private", "root.key")
  const source = `import { resolveRootKey } from "./src/server/custody/key.ts";
    resolveRootKey({ filename: ${JSON.stringify(filename)}, allowCreate: true });`
  await Promise.all(
    Array.from({ length: 6 }, () =>
      promisify(execFile)("bun", ["-e", source], { timeout: 10_000 }),
    ),
  )
  expect(readFileSync(filename)).toHaveLength(32)
  expect(readdirSync(join(root, "private"))).toEqual(["root.key"])
})
