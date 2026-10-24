import { SOURCE_CONDITION } from "@plainworks/vitest-config"
import type { PackageBuild } from "./build.ts"

/** One target in a package `exports` map: an entry's conditions, or an asset's file. */
export type ExportTarget = string | Readonly<Record<string, string>>

/**
 * The package `exports` map for a build: each entry under its subpath, source first for the repo,
 * then the `dist` types and module. An asset copied from `src` also resolves to that file under the
 * source condition, so a source-linked consumer reads live stylesheets; a generated asset exists
 * only as its `dist` file.
 */
export function renderExports(build: PackageBuild): Record<string, ExportTarget> {
  const exports: Record<string, ExportTarget> = {}
  for (const [key, source] of Object.entries(build.entry)) {
    const subpath = key === "index" ? "." : `./${key}`
    const dist = { types: `./dist/${key}.d.ts`, default: `./dist/${key}.js` }
    exports[subpath] = isVendored(build, source)
      ? dist
      : { [SOURCE_CONDITION]: `./${source}`, ...dist }
  }
  for (const [name, asset] of Object.entries(build.assets ?? {})) {
    const dist = `./dist/${name}`
    exports[`./${name}`] =
      "from" in asset ? { [SOURCE_CONDITION]: `./${asset.from}`, default: dist } : dist
  }
  return exports
}

function isVendored(build: PackageBuild, source: string): boolean {
  return build.vendored !== undefined && source.startsWith(`${build.vendored}/`)
}
