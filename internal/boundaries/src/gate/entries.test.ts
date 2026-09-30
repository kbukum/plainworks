import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { beforeAll, expect, test } from "vitest"

/**
 * One import path per name. Every public name in a package is reachable from exactly one of its
 * entries (`.`, `./client`, a concern, adapter, or component subpath), so the path a reader sees
 * always tells them the concern. A name re-exported by two entries is a second, competing path.
 *
 * This reads each package's source entries from the generated `exports` map, resolves every
 * exported name to the declaration it aliases, and fails when one declaration is exported by more
 * than one entry.
 */
const here = dirname(fileURLToPath(import.meta.url))
const packagesDir = resolve(here, "../../../../packages")
const fixtures = resolve(here, "../../fixtures/entries")

const SOURCE_CONDITION = "@plainworks/source"

const COMPILER_OPTIONS: ts.CompilerOptions = {
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ES2022,
  customConditions: [SOURCE_CONDITION],
  allowImportingTsExtensions: true,
  noEmit: true,
  // Export resolution needs neither the default libs nor ambient `@types` packages; loading them
  // only slows the program.
  noLib: true,
  types: [],
}

function createEntryProgram(files: Iterable<string>): ts.Program {
  return ts.createProgram([...files], COMPILER_OPTIONS)
}

/** Maps each declaration exported by more than one entry to those entries. */
function sharedExports(
  entries: ReadonlyMap<string, string>,
  program: ts.Program = createEntryProgram(entries.values()),
): Map<string, string[]> {
  const checker = program.getTypeChecker()
  const owners = new Map<string, string[]>()
  for (const [entry, file] of entries) {
    const source = program.getSourceFile(file)
    const module = source && checker.getSymbolAtLocation(source)
    if (module === undefined) throw new Error(`entry "${entry}" did not compile: ${file}`)
    for (const exported of checker.getExportsOfModule(module)) {
      const target =
        exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
      const declared = target.declarations?.[0]?.getSourceFile().fileName ?? file
      const id = `${declared}#${exported.name}`
      owners.set(id, [...(owners.get(id) ?? []), entry])
    }
  }
  return new Map([...owners].filter(([, paths]) => paths.length > 1))
}

/** Reads a package's script entries (subpath → source file) from its generated `exports` map. */
function sourceEntries(dir: string): Map<string, string> {
  const manifest: unknown = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"))
  const exports =
    typeof manifest === "object" && manifest !== null && "exports" in manifest
      ? manifest.exports
      : undefined
  const entries = new Map<string, string>()
  if (typeof exports !== "object" || exports === null) return entries
  for (const [subpath, conditions] of Object.entries(exports)) {
    const source: unknown =
      typeof conditions === "object" && conditions !== null
        ? Reflect.get(conditions, SOURCE_CONDITION)
        : undefined
    if (typeof source === "string" && /\.tsx?$/.test(source)) {
      entries.set(subpath, resolve(dir, source))
    }
  }
  return entries
}

test("the check catches a name exported by two entries", () => {
  const entries = new Map([
    [".", join(fixtures, "first.ts")],
    ["./second", join(fixtures, "second.ts")],
  ])
  expect([...sharedExports(entries).values()]).toEqual([[".", "./second"]])
})

const packages = readdirSync(packagesDir).filter((name) =>
  existsSync(join(packagesDir, name, "package.json")),
)
const packageEntries = new Map(
  packages.map((name) => [name, sourceEntries(join(packagesDir, name))]),
)

// One program over every package's entries, so shared sources are parsed once rather than once per
// package. It compiles the whole workspace, so it gets its own budget instead of the per-test one.
let allEntries: ts.Program
beforeAll(() => {
  allEntries = createEntryProgram([...packageEntries.values()].flatMap((e) => [...e.values()]))
}, 120_000)

test.each(packages)("every public name in %s has one import path", (name) => {
  const entries = packageEntries.get(name) ?? new Map<string, string>()
  const shared = [...sharedExports(entries, allEntries)].map(
    ([id, paths]) => `${id.slice(id.lastIndexOf("#") + 1)} → ${paths.join(", ")}`,
  )
  expect(shared).toEqual([])
})
