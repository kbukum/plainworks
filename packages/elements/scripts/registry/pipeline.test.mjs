import { afterEach, describe, expect, it } from "vitest"
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { diffAtom, diffReport, ingestAtom, validateRegistry } from "./pipeline.mjs"

// Every case runs the pipeline with an injected `pull`, so it exercises the exact transform and
// codegen CI runs, never a network call to the shadcn registry.
const upstream = (name) =>
  [`// ${name}`, 'import * as React from "react"', 'import { cn } from "cn"', ""].join("\n")

// The formatter seam is exercised for real by the gates; here it is the identity so the pipeline
// stays offline and the assertions read the exact transform output.
const identity = (source) => source

const roots = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function stageRoot() {
  const root = mkdtempSync(join(tmpdir(), "pw-elements-cli-"))
  roots.push(root)
  mkdirSync(join(root, "src/atoms"), { recursive: true })
  return root
}

describe("atom ingest pipeline", () => {
  it("writes an owned file that is a client module rendering against the theme cn", () => {
    const root = stageRoot()
    ingestAtom(root, "button", upstream, identity)
    const owned = readFileSync(join(root, "src/atoms/button.tsx"), "utf8")
    expect(owned.startsWith('"use client"')).toBe(true)
    expect(owned).toContain('import { cn } from "@plainworks/theme"')
    expect(owned).not.toContain('from "cn"')
  })

  it("reports no delta once an atom has been ingested from that upstream", () => {
    const root = stageRoot()
    ingestAtom(root, "button", upstream, identity)
    expect(diffAtom(root, "button", upstream, identity).changed).toBe(false)
  })

  it("applies a declared accessibility correction while materializing, durably across diff", () => {
    const root = stageRoot()
    // Upstream ItemGroup ships an invalid default `role="list"`; the materialize pipeline must
    // strip it, and a re-diff against the same upstream must then report no delta — proving the
    // correction is reproduced, not a one-off hand edit that `registry:update` would drop.
    const itemUpstream = () =>
      [
        'import * as React from "react"',
        "export function ItemGroup(props) {",
        "  return (",
        "    <div",
        '      role="list"',
        '      data-slot="item-group"',
        "    />",
        "  )",
        "}",
        "",
      ].join("\n")
    const owned = ingestAtom(root, "item", itemUpstream, identity)
    expect(owned).not.toContain('role="list"')
    expect(owned).toContain('data-slot="item-group"')
    expect(diffAtom(root, "item", itemUpstream, identity).changed).toBe(false)
  })

  it("reports a delta when upstream moves away from the owned file", () => {
    const root = stageRoot()
    ingestAtom(root, "button", upstream, identity)
    const moved = (name) => `${upstream(name)}export const version = 2\n`
    const result = diffAtom(root, "button", moved, identity)
    expect(result.changed).toBe(true)
    expect(result.fresh).toContain("version = 2")
  })

  it("prints a reviewable unified diff per changed atom, not byte counts", () => {
    const root = stageRoot()
    ingestAtom(root, "button", upstream, identity)
    const moved = (name) => `${upstream(name)}export const version = 2\n`
    const report = diffReport(root, ["button"], moved, identity)
    expect(report).toContain("--- button (owned)\n+++ button (upstream + compat)\n")
    expect(report).toContain("+export const version = 2")
    expect(report).toContain("@@ ")
    expect(report).not.toContain("bytes")
    expect(report).toContain("registry:update")
  })

  it("reports an unchanged atom as up to date", () => {
    const root = stageRoot()
    ingestAtom(root, "button", upstream, identity)
    expect(diffReport(root, ["button"], upstream, identity)).toBe(
      "button: up to date with upstream (compat delta aside).\n",
    )
  })
})

describe("registry validation (offline)", () => {
  function writeRegistry(root, registry) {
    writeFileSync(join(root, "registry.json"), JSON.stringify(registry))
  }

  it("passes when every declared atom file exists", () => {
    const root = stageRoot()
    ingestAtom(root, "button", upstream, identity)
    writeRegistry(root, {
      name: "plainworks-elements",
      items: [{ name: "button", type: "registry:ui", files: [{ path: "src/atoms/button.tsx" }] }],
    })
    expect(validateRegistry(root)).toEqual([])
  })

  it("fails when a declared file is missing", () => {
    const root = stageRoot()
    writeRegistry(root, {
      name: "plainworks-elements",
      items: [{ name: "ghost", type: "registry:ui", files: [{ path: "src/atoms/ghost.tsx" }] }],
    })
    expect(validateRegistry(root)).toContain("ghost: declared file is missing: src/atoms/ghost.tsx")
  })

  it("fails when the registry has no name", () => {
    const root = stageRoot()
    writeRegistry(root, { items: [] })
    expect(validateRegistry(root)).toContain("registry.json is missing a `name`.")
  })
})
