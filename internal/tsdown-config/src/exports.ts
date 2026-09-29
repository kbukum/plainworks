import { SOURCE_CONDITION } from "@plainworks/vitest-config"
import type { PackageBuild } from "./build.ts"

/** One target in a package `exports` map: an entry's conditions, or an asset's file. */
export type ExportTarget = string | Readonly<Record<string, string>>

/**
 * The package `exports` map for a build: each entry under its subpath, source first for the repo,
 * then the `dist` types and module; each asset as its `dist` file.
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
  for (const name of Object.keys(build.assets ?? {})) exports[`./${name}`] = `./dist/${name}`
  return exports
}

function isVendored(build: PackageBuild, source: string): boolean {
  return build.vendored !== undefined && source.startsWith(`${build.vendored}/`)
}
