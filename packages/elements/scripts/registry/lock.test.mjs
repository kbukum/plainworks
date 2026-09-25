import { afterEach, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { LOCK_FILE, lockAtom, verifyLock } from "./lock.mjs"
import { packageRoot } from "./manifest.mjs"
import { OWNED_DIR, SHADCN_DIR } from "./sources.mjs"

const roots = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const upstream = { cli: "4.21.0", style: "base-nova" }

function stageRoot() {
  const root = mkdtempSync(join(tmpdir(), "pw-elements-lock-"))
  roots.push(root)
  mkdirSync(join(root, SHADCN_DIR), { recursive: true })
  mkdirSync(join(root, OWNED_DIR), { recursive: true })
  return root
}

function writeAtom(root, name, source) {
  writeFileSync(join(root, SHADCN_DIR, `${name}.tsx`), source)
}

describe("shadcn lock", () => {
  it("accepts atoms whose content matches their locked hash", () => {
    const root = stageRoot()
    writeAtom(root, "button", "export const Button = 1\n")
    lockAtom(root, "button", "export const Button = 1\n", upstream)
    expect(verifyLock(root)).toEqual([])
    const lock = JSON.parse(readFileSync(join(root, LOCK_FILE), "utf8"))
    expect(lock.shadcn).toEqual(upstream)
    expect(lock.atoms.button).toMatch(/^sha256-[0-9a-f]{64}$/)
  })

  it("reports a hand-edited shadcn atom", () => {
    const root = stageRoot()
    lockAtom(root, "button", "export const Button = 1\n", upstream)
    writeAtom(root, "button", "export const Button = 2\n")
    expect(verifyLock(root)).toEqual([
      `${SHADCN_DIR}/button.tsx was edited by hand; only \`registry:update button\` may change it.`,
    ])
  })

  it("reports shadcn atoms missing from the lock and lock entries missing on disk", () => {
    const root = stageRoot()
    lockAtom(root, "ghost", "x\n", upstream)
    writeAtom(root, "button", "export const Button = 1\n")
    expect(verifyLock(root)).toEqual([
      `${SHADCN_DIR}/button.tsx is not in ${LOCK_FILE}; add it with \`registry:add button\`.`,
      `${LOCK_FILE} locks "ghost" but ${SHADCN_DIR}/ghost.tsx does not exist.`,
    ])
  })

  it("ignores owned atoms and tests", () => {
    const root = stageRoot()
    writeFileSync(join(root, OWNED_DIR, "sonner.tsx"), "export {}\n")
    writeFileSync(join(root, SHADCN_DIR, "button.test.tsx"), "export {}\n")
    expect(verifyLock(root)).toEqual([])
  })

  it("holds for the committed package: no shadcn atom has been hand-edited", () => {
    expect(verifyLock(packageRoot)).toEqual([])
  })
})
