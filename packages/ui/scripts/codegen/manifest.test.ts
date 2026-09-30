import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"
import { formatSource } from "./format"
import {
  buildRegistry,
  buildTsdownEntry,
  CONCERNS,
  collectItemFiles,
  packageRoot,
  renderTsdownConfig,
  runCodegen,
  scanDependencies,
} from "./manifest"

// Every authored, non-test module under a concern folder, read from disk rather than from the
// `CONCERNS` list codegen uses, so the lock-step check catches a module nobody declared.
function discoverModules(root: string): string[] {
  const modules: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        modules.push(relative(root, full).split("\\").join("/"))
      }
    }
  }
  walk(join(root, "src/client"))
  walk(join(root, "src/state"))
  return modules.sort()
}

describe("dependency scan", () => {
  it("classifies external and workspace packages as npm dependencies", () => {
    const source = [
      'import * as React from "react"',
      'import { cn } from "@plainworks/theme"',
      'import { Button } from "@plainworks/elements/button"',
      'import { Table } from "@plainworks/elements/table"',
      'import { ChevronDown } from "lucide-react"',
      'import { useSelection } from "../../state/use-selection"',
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
    const files = collectItemFiles(packageRoot, ["src/client/data"])
    // A component folder inside the concern ships whole.
    expect(files).toContain("src/client/data/data-table/table.tsx")
    expect(files).toContain("src/client/data/data-table/columns.ts")
    // `table.tsx` imports state hooks and a feedback component from outside the concern; they must
    // ship with the item, or a shadcn install resolves those imports to nothing.
    expect(files).toContain("src/state/use-selection.ts")
    expect(files).toContain("src/state/use-controllable-state.ts")
    expect(files).toContain("src/client/feedback/empty-state.tsx")
  })
})

describe("codegen stays in lock-step with disk (cannot drift)", () => {
  it("re-derives the committed registry.json exactly", () => {
    const committed = JSON.parse(readFileSync(join(packageRoot, "registry.json"), "utf8"))
    expect(buildRegistry(packageRoot)).toEqual(committed)
  })

  it("lists only authored source a published package ships, so an install from npm resolves", () => {
    const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"))
    expect(pkg.files).toEqual(expect.arrayContaining(["src", "registry.json"]))
    const paths = buildRegistry(packageRoot).items.flatMap((item) => item.files.map((f) => f.path))
    expect(paths).toContain("src/region/async-status.ts")
    for (const path of paths) {
      expect(path.startsWith("src/")).toBe(true)
      expect(path).not.toMatch(/\.test\./)
    }
  })

  it("publishes each component at a nested `<concern>/<component>` subpath", () => {
    const entry = buildTsdownEntry()
    expect(entry.index).toBe("src/index.ts")
    expect(entry["layout/page"]).toBe("src/client/layout/page.tsx")
    expect(entry["data/data-table"]).toBe("src/client/data/data-table/index.ts")
    expect(entry["forms/text-field"]).toBe("src/client/forms/text-field.tsx")
    expect(entry["state/use-disclosure"]).toBe("src/state/use-disclosure.ts")
    expect(entry["clipboard/use-clipboard"]).toBe("src/client/clipboard/use-clipboard.ts")
  })

  it("ships no concern aggregate and no `client` aggregate", () => {
    for (const key of Object.keys(buildTsdownEntry())) {
      if (key === "index") continue
      expect(key).toMatch(/^[a-z-]+\/[a-z-]+$/)
    }
    expect(buildTsdownEntry().client).toBeUndefined()
  })

  it("re-derives the committed tsdown.config.ts entry map exactly", () => {
    const rendered = formatSource(renderTsdownConfig(), "tsdown.config.ts")
    const committed = readFileSync(join(packageRoot, "tsdown.config.ts"), "utf8")
    expect(rendered).toBe(committed)
  })

  it("ships registry.json with the package so the shadcn registry resolves from npm", () => {
    expect(renderTsdownConfig()).toContain('files: ["registry.json"]')
  })

  it("declares every authored module as a published component or an internal one", () => {
    const modules = discoverModules(packageRoot)
    // Guard the guard: disk discovery must actually find modules, never pass on an empty set.
    expect(modules.length).toBeGreaterThan(0)
    const published = new Set(Object.values(buildTsdownEntry()))
    const internal = new Set(
      CONCERNS.flatMap((concern) => concern.internal ?? []).map((path) => `src/${path}`),
    )
    const componentFolders = [...published]
      .filter((source) => source.endsWith("/index.ts"))
      .map((source) => source.slice(0, -"index.ts".length))
    for (const module of modules) {
      const declared =
        published.has(module) ||
        internal.has(module) ||
        componentFolders.some((folder) => module.startsWith(folder))
      expect(declared, `${module} is neither published nor declared internal`).toBe(true)
    }
  })
})

describe("codegen orchestration writes every artifact from disk", () => {
  it("regenerates registry.json and the build description", () => {
    const root = mkdtempSync(join(tmpdir(), "pw-ui-codegen-"))
    try {
      // `runCodegen` resolves every declared module and scans every registry concern folder, so the
      // fixture stands each module up as one authored file; `layout` is the one asserted in detail.
      for (const concern of CONCERNS) {
        for (const module of concern.modules) {
          const file = join(root, `src/${concern.dirs[0]}/${module}.tsx`)
          mkdirSync(join(file, ".."), { recursive: true })
          writeFileSync(file, '"use client"\nexport const Part = () => null\n')
        }
      }
      writeFileSync(
        join(root, "src/client/layout/stack.tsx"),
        '"use client"\nimport { Button } from "@plainworks/elements/button"\nexport const Stack = () => Button\n',
      )

      runCodegen(root)

      expect(readFileSync(join(root, "tsdown.config.ts"), "utf8")).toContain(
        '"layout/stack": "src/client/layout/stack.tsx"',
      )
      const registry = JSON.parse(readFileSync(join(root, "registry.json"), "utf8"))
      const layout = registry.items.find((item: { name: string }) => item.name === "layout")
      expect(layout.dependencies).toEqual(["@plainworks/elements"])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
