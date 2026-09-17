import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"
import { formatSource } from "./format.mjs"
import {
  buildExports,
  buildRegistry,
  buildTsdownEntry,
  collectItemFiles,
  packageRoot,
  renderTsdownConfig,
  runCodegen,
  scanDependencies,
} from "./manifest.mjs"

// Every `index.ts` barrel under `src/client` is a public concern that must be a build entry.
// Reading this from disk — not the `CONCERNS` list codegen uses — is what makes the lock-step
// check able to catch a concern folder someone forgot to register.
function discoverClientBarrels(root) {
  const barrels = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.name === "index.ts") {
        barrels.push(relative(root, full).split("\\").join("/"))
      }
    }
  }
  walk(join(root, "src/client"))
  return barrels.sort()
}

describe("dependency scan", () => {
  it("classifies external and workspace packages as npm dependencies", () => {
    const source = [
      'import * as React from "react"',
      'import { cn } from "@plainworks/theme"',
      'import { Button } from "@plainworks/elements/button"',
      'import { Table } from "@plainworks/elements/table"',
      'import { ChevronDown } from "lucide-react"',
      'import { useSelection } from "../../hooks"',
    ].join("\n")
    expect(scanDependencies(source)).toEqual({
      dependencies: ["@plainworks/elements", "@plainworks/theme", "lucide-react"],
      registryDependencies: [],
    })
  })

  it("does not mistake a package that merely starts with `react` for the peer", () => {
    const source = 'import { DayPicker } from "react-day-picker"\n'
    expect(scanDependencies(source).dependencies).toEqual(["react-day-picker"])
  })

  it("treats a relative intra-concern import as neither dependency kind", () => {
    const source = 'import { columns } from "./columns"\n'
    expect(scanDependencies(source)).toEqual({ dependencies: [], registryDependencies: [] })
  })

  it("includes relative imports that escape the concern so an item installs self-contained", () => {
    const files = collectItemFiles(packageRoot, "src/client/data-table")
    expect(files).toContain("src/client/data-table/data-table.tsx")
    // `data-table.tsx` imports `../../hooks`; that barrel and the hook modules behind it must ship
    // with the item, or a shadcn install resolves `../../hooks` to nothing.
    expect(files).toContain("src/hooks/index.ts")
    expect(files).toContain("src/hooks/use-selection.ts")
    expect(files).toContain("src/hooks/use-controllable-state.ts")
  })
})

describe("codegen stays in lock-step with disk (cannot drift)", () => {
  it("re-derives the committed registry.json exactly", () => {
    const committed = JSON.parse(readFileSync(join(packageRoot, "registry.json"), "utf8"))
    expect(buildRegistry(packageRoot)).toEqual(committed)
  })

  it("re-derives the committed package exports map exactly", () => {
    const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"))
    expect(buildExports()).toEqual(pkg.exports)
  })

  it("gives the manifest and every concern a tsdown entry", () => {
    const entry = buildTsdownEntry()
    expect(entry.index).toBe("src/index.ts")
    expect(entry["data-table"]).toBe("src/client/data-table/index.ts")
  })

  it("re-derives the committed tsdown.config.ts entry map exactly", () => {
    const rendered = formatSource(renderTsdownConfig(), "tsdown.config.ts")
    const committed = readFileSync(join(packageRoot, "tsdown.config.ts"), "utf8")
    expect(rendered).toBe(committed)
  })

  it("gives every client concern barrel on disk a build entry (independent of the CONCERNS list)", () => {
    const barrels = discoverClientBarrels(packageRoot)
    // Guard the guard: disk discovery must actually find concerns, never pass on an empty set.
    expect(barrels.length).toBeGreaterThan(0)
    const entrySources = new Set(Object.values(buildTsdownEntry()))
    for (const barrel of barrels) {
      expect(entrySources.has(barrel)).toBe(true)
    }
  })
})

describe("codegen orchestration writes every artifact from disk", () => {
  it("regenerates registry.json, the tsdown entries, and package exports", () => {
    const root = mkdtempSync(join(tmpdir(), "pw-ui-codegen-"))
    try {
      // `runCodegen` scans every registry concern folder, so the fixture stands each one up with a
      // single authored file; `layout` is the one asserted in detail.
      const registryDirs = [
        "src/client/layout",
        "src/client/feedback",
        "src/client/overlays",
        "src/client/display",
        "src/client/navigation",
        "src/client/data-table",
        "src/client/forms",
        "src/client/list",
        "src/client/error-fallback",
      ]
      for (const dir of registryDirs) {
        mkdirSync(join(root, dir), { recursive: true })
        writeFileSync(join(root, `${dir}/index.ts`), 'export * from "./part"\n')
        writeFileSync(
          join(root, `${dir}/part.tsx`),
          '"use client"\nexport const Part = () => null\n',
        )
      }
      writeFileSync(
        join(root, "src/client/layout/part.tsx"),
        '"use client"\nimport { Button } from "@plainworks/elements/button"\nexport const Stack = () => Button\n',
      )
      writeFileSync(join(root, "package.json"), `${JSON.stringify({ name: "x", exports: {} })}\n`)

      runCodegen(root)

      expect(readFileSync(join(root, "tsdown.config.ts"), "utf8")).toContain(
        "src/client/layout/index.ts",
      )
      const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
      expect(pkg.exports["./layout"]).toEqual({
        types: "./dist/layout.d.ts",
        import: "./dist/layout.js",
      })
      const registry = JSON.parse(readFileSync(join(root, "registry.json"), "utf8"))
      const layout = registry.items.find((item) => item.name === "layout")
      expect(layout.dependencies).toEqual(["@plainworks/elements"])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
