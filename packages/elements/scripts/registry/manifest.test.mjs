import { describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  atomNames,
  buildExports,
  buildRegistry,
  buildTsdownEntry,
  packageRoot,
  renderRegistryTs,
  renderTsdownConfig,
  runCodegen,
  scanDependencies,
} from "./manifest.mjs"
import { formatSource } from "./format.mjs"

describe("dependency scan", () => {
  it("splits third-party npm deps from sibling registry deps", () => {
    const source = [
      'import * as React from "react"',
      'import { cn } from "@plainworks/theme"',
      'import { Menu } from "@base-ui/react/menu"',
      'import { ChevronDown } from "lucide-react"',
      'import { Button } from "@/atoms/button"',
    ].join("\n")
    expect(scanDependencies(source)).toEqual({
      dependencies: ["@base-ui/react", "lucide-react"],
      registryDependencies: ["button"],
    })
  })

  it("does not mistake a package that merely starts with `react` for the peer", () => {
    const source = 'import { DayPicker } from "react-day-picker"\n'
    expect(scanDependencies(source).dependencies).toEqual(["react-day-picker"])
  })

  it("throws on an unrecognized `@/` alias rather than silently dropping it", () => {
    const source = 'import { useMobile } from "@/hooks/use-mobile"\n'
    expect(() => scanDependencies(source)).toThrow(/Unsupported atom import alias/)
  })
})

describe("codegen stays in lock-step with disk (cannot drift)", () => {
  it("re-derives the committed registry.json exactly", () => {
    const committed = JSON.parse(readFileSync(join(packageRoot, "registry.json"), "utf8"))
    expect(buildRegistry(packageRoot)).toEqual(committed)
  })

  it("re-derives the committed package exports map exactly", () => {
    const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"))
    expect(buildExports(atomNames(packageRoot))).toEqual(pkg.exports)
  })

  it("gives every atom its own tsdown entry alongside the manifest", () => {
    const names = atomNames(packageRoot)
    const entry = buildTsdownEntry(names)
    expect(entry.index).toBe("src/index.ts")
    for (const name of names) {
      expect(entry[name]).toBe(`src/atoms/${name}.tsx`)
    }
  })

  it("re-derives the committed src/registry.ts manifest exactly", () => {
    const rendered = formatSource(renderRegistryTs(atomNames(packageRoot)), "registry.ts")
    const committed = readFileSync(join(packageRoot, "src/registry.ts"), "utf8")
    expect(rendered).toBe(committed)
  })

  it("re-derives the committed tsdown.config.ts entry map exactly", () => {
    const rendered = formatSource(renderTsdownConfig(atomNames(packageRoot)), "tsdown.config.ts")
    const committed = readFileSync(join(packageRoot, "tsdown.config.ts"), "utf8")
    expect(rendered).toBe(committed)
  })
})

describe("codegen orchestration writes every artifact from disk", () => {
  it("regenerates registry.json, the manifest, the tsdown entries, and package exports", () => {
    const root = mkdtempSync(join(tmpdir(), "pw-elements-codegen-"))
    try {
      mkdirSync(join(root, "src/atoms"), { recursive: true })
      writeFileSync(
        join(root, "src/atoms/button.tsx"),
        '"use client"\nexport const Button = () => null\n',
      )
      writeFileSync(join(root, "package.json"), `${JSON.stringify({ name: "x", exports: {} })}\n`)

      expect(runCodegen(root)).toEqual(["button"])

      expect(readFileSync(join(root, "src/registry.ts"), "utf8")).toContain('"button"')
      expect(readFileSync(join(root, "tsdown.config.ts"), "utf8")).toContain(
        "src/atoms/button.tsx",
      )
      const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
      expect(pkg.exports["./button"]).toEqual({
        types: "./dist/button.d.ts",
        import: "./dist/button.js",
      })
      const registry = JSON.parse(readFileSync(join(root, "registry.json"), "utf8"))
      expect(registry.items[0].name).toBe("button")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
