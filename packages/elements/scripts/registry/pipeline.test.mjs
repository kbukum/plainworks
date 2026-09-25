import { afterEach, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { diffAtom, diffReport, ingestAtom, validateRegistry } from "./pipeline.mjs"
import { LOCK_FILE } from "./lock.mjs"
import { OWNED_DIR, SHADCN_DIR } from "./sources.mjs"

// Every case injects offline seams, so it exercises the exact transform, write, and lock CI runs,
// never a network call to the shadcn registry. The fixer is the identity so assertions read the
// exact transform output; the real Biome fixer is covered in format.test.mjs.
const upstream = (name) =>
  [`// ${name}`, 'import * as React from "react"', 'import { cn } from "cn"', ""].join("\n")

function seams(pull = upstream) {
  return { pull, fix: (source) => source, upstream: () => ({ cli: "4.21.0", style: "base-nova" }) }
}

const roots = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function stageRoot() {
  const root = mkdtempSync(join(tmpdir(), "pw-elements-cli-"))
  roots.push(root)
  mkdirSync(join(root, SHADCN_DIR), { recursive: true })
  mkdirSync(join(root, OWNED_DIR), { recursive: true })
  return root
}

const moved = (name) => `${upstream(name)}export const version = 2\n`

describe("atom ingest pipeline", () => {
  it("writes a client module under src/shadcn that renders against the theme cn", () => {
    const root = stageRoot()
    ingestAtom(root, "button", seams())
    const atom = readFileSync(join(root, SHADCN_DIR, "button.tsx"), "utf8")
    expect(atom.startsWith('"use client"')).toBe(true)
    expect(atom).toContain('import { cn } from "@plainworks/theme"')
    expect(atom).not.toContain('from "cn"')
  })

  it("locks the ingested atom so the lock verifies clean", () => {
    const root = stageRoot()
    ingestAtom(root, "button", seams())
    const lock = JSON.parse(readFileSync(join(root, LOCK_FILE), "utf8"))
    expect(Object.keys(lock.atoms)).toEqual(["button"])
    expect(lock.shadcn).toEqual({ cli: "4.21.0", style: "base-nova" })
  })

  it("refuses a name an owned atom already publishes", () => {
    const root = stageRoot()
    writeFileSync(join(root, OWNED_DIR, "sonner.tsx"), "export {}\n")
    expect(() => ingestAtom(root, "sonner", seams())).toThrow(/is an owned atom/)
  })

  it("reports no delta once an atom has been ingested from that upstream", () => {
    const root = stageRoot()
    ingestAtom(root, "button", seams())
    expect(diffAtom(root, "button", seams()).changed).toBe(false)
  })

  it("reports a delta when upstream moves away from the locked file", () => {
    const root = stageRoot()
    ingestAtom(root, "button", seams())
    const result = diffAtom(root, "button", seams(moved))
    expect(result.changed).toBe(true)
    expect(result.fresh).toContain("version = 2")
  })

  it("prints a reviewable unified diff per changed atom", () => {
    const root = stageRoot()
    ingestAtom(root, "button", seams())
    const report = diffReport(root, ["button"], seams(moved))
    expect(report).toContain("--- button (locked)\n+++ button (upstream)\n")
    expect(report).toContain("+export const version = 2")
    expect(report).toContain("@@ ")
    expect(report).toContain("registry:update")
  })

  it("reports an unchanged atom as up to date", () => {
    const root = stageRoot()
    ingestAtom(root, "button", seams())
    expect(diffReport(root, ["button"], seams())).toBe("button: up to date with upstream.\n")
  })
})

describe("registry validation (offline)", () => {
  function writeRegistry(root, registry) {
    writeFileSync(join(root, "registry.json"), JSON.stringify(registry))
  }

  it("passes when every declared atom file exists and the lock holds", () => {
    const root = stageRoot()
    ingestAtom(root, "button", seams())
    writeRegistry(root, {
      name: "plainworks-elements",
      items: [{ name: "button", type: "registry:ui", files: [{ path: `${SHADCN_DIR}/button.tsx` }] }],
    })
    expect(validateRegistry(root)).toEqual([])
  })

  it("fails when a shadcn atom was edited by hand", () => {
    const root = stageRoot()
    ingestAtom(root, "button", seams())
    writeFileSync(join(root, SHADCN_DIR, "button.tsx"), "// tweaked\n")
    writeRegistry(root, { name: "plainworks-elements", items: [] })
    expect(validateRegistry(root)).toEqual([
      `${SHADCN_DIR}/button.tsx was edited by hand; only \`registry:update button\` may change it.`,
    ])
  })

  it("fails when a declared file is missing", () => {
    const root = stageRoot()
    writeRegistry(root, {
      name: "plainworks-elements",
      items: [{ name: "ghost", type: "registry:ui", files: [{ path: `${SHADCN_DIR}/ghost.tsx` }] }],
    })
    expect(validateRegistry(root)).toContain(
      `ghost: declared file is missing: ${SHADCN_DIR}/ghost.tsx`,
    )
  })

  it("fails when the registry has no name", () => {
    const root = stageRoot()
    writeRegistry(root, { items: [] })
    expect(validateRegistry(root)).toContain("registry.json is missing a `name`.")
  })
})
