import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import ts from "typescript"

/**
 * One import path per name. Every public name in a package is reachable from exactly one of its
 * entries (`.`, `./client`, a concern, adapter, or component subpath), so the path a reader sees
 * always tells them the concern. A name re-exported by two entries is a second, competing path.
 *
 * This reads each package's source entries from the generated `exports` map, resolves every
 * exported name to the declaration it aliases, and reports each declaration exported by more than
 * one entry.
 */
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

/** A name a package exports from more than one entry, with those entries. */
export interface SharedExport {
  readonly name: string
  readonly entries: readonly string[]
}

/** Reads a package's script entries (subpath → source file) from its generated `exports` map. */
export function sourceEntries(dir: string): Map<string, string> {
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

/** Lists the declarations in `entries` that more than one entry exports, using `program`. */
function sharedExports(
  entries: ReadonlyMap<string, string>,
  program: ts.Program,
): readonly SharedExport[] {
  const checker = program.getTypeChecker()
  const owners = new Map<string, { name: string; entries: string[] }>()
  for (const [entry, file] of entries) {
    const source = program.getSourceFile(file)
    const module = source && checker.getSymbolAtLocation(source)
    if (module === undefined) throw new Error(`entry "${entry}" did not compile: ${file}`)
    for (const exported of checker.getExportsOfModule(module)) {
      const target =
        exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
      const declared = target.declarations?.[0]?.getSourceFile().fileName ?? file
      const id = `${declared}#${exported.name}`
      const owner = owners.get(id) ?? { name: exported.name, entries: [] }
      owner.entries.push(entry)
      owners.set(id, owner)
    }
  }
  return [...owners.values()].filter((owner) => owner.entries.length > 1)
}

/**
 * Checks every package under `packagesDir` and maps each package with a name exported by more
 * than one entry to those names. One program over all entries binds shared sources once.
 */
export function checkEntries(packagesDir: string): Map<string, readonly SharedExport[]> {
  const packages = new Map(
    readdirSync(packagesDir)
      .filter((name) => existsSync(join(packagesDir, name, "package.json")))
      .map((name) => [name, sourceEntries(join(packagesDir, name))]),
  )
  const program = ts.createProgram(
    [...packages.values()].flatMap((entries) => [...entries.values()]),
    COMPILER_OPTIONS,
  )
  const failures = new Map<string, readonly SharedExport[]>()
  for (const [name, entries] of packages) {
    const shared = sharedExports(entries, program)
    if (shared.length > 0) failures.set(name, shared)
  }
  return failures
}
