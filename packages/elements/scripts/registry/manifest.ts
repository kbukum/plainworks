import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { formatSource } from "./format"
import { type AtomSource, atomSources } from "./sources"

// registry.json, the tsdown build description, and the `.` manifest are derived from the atom files
// on disk (`src/shadcn/` + `src/atoms/`), so none of them can silently drift from the actual atom
// set. `codegen` writes them, and a test asserts re-deriving them produces no change. The package
// `exports` follow from the build description through `bun run sync-shape`.

export const packageRoot: string = fileURLToPath(new URL("../../", import.meta.url))

/** An atom's imports split into third-party npm deps and sibling registry deps. */
export interface DependencyScan {
  dependencies: string[]
  registryDependencies: string[]
}

/** One file a shadcn registry item ships, tagged with its item type. */
export interface RegistryFile {
  path: string
  type: string
}

/** A single shadcn `registry.json` item derived from one atom. */
export interface RegistryItem {
  name: string
  type: string
  registryDependencies?: string[]
  dependencies?: string[]
  files: RegistryFile[]
}

/** The self-publishing `registry.json` object shape. */
export interface Registry {
  $schema: string
  name: string
  homepage: string
  items: RegistryItem[]
}

// react is a peer and `@plainworks/*` packages are workspace substrate — neither is a shadcn dep.
// The `(\/|$)` boundary keeps this from also swallowing packages that merely start with `react`
// (e.g. `react-day-picker`).
const NON_DEPENDENCY = /^(react|react-dom)(\/|$)|^@plainworks\//

/** Sorted names of every published atom, shadcn and owned. */
export function atomNames(root: string = packageRoot): string[] {
  return atomSources(root).map((atom) => atom.name)
}

// Every `from "<specifier>"` in an atom, deduped in source order.
function importSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const seen = new Set<string>()
  const pattern = /from\s+["']([^"']+)["']/g
  let match = pattern.exec(source)
  while (match !== null) {
    const specifier = match[1]
    if (specifier !== undefined && !seen.has(specifier)) {
      seen.add(specifier)
      specifiers.push(specifier)
    }
    match = pattern.exec(source)
  }
  return specifiers
}

// The npm package a bare specifier resolves to: the scope + name for `@scope/pkg/deep`, the first
// segment otherwise.
function packageName(specifier: string): string {
  const segments = specifier.split("/")
  return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : (segments[0] ?? specifier)
}

/**
 * Classify an atom's imports into its shadcn `dependencies` (third-party npm packages) and
 * `registryDependencies` (sibling atoms it composes), both sorted and deduped.
 */
export function scanDependencies(source: string): DependencyScan {
  const dependencies = new Set<string>()
  const registryDependencies = new Set<string>()
  for (const specifier of importSpecifiers(source)) {
    const sibling = /^@\/(?:shadcn|atoms)\/(.+)$/.exec(specifier)
    if (sibling?.[1] !== undefined) {
      registryDependencies.add(sibling[1])
    } else if (specifier.startsWith("@/")) {
      // Only sibling atoms (`@/shadcn/*`, `@/atoms/*`) are a recognized registry dependency.
      // Any other `@/` alias (e.g. a future `@/hooks/*` or `@/lib/*`) has no ingestion or
      // classification path yet, so fail loudly at codegen rather than silently emitting an
      // incomplete registry item that would break `shadcn add @plainworks/elements/<atom>` for an
      // external consumer.
      throw new Error(
        `Unsupported atom import alias "${specifier}": only "@/shadcn/*" and "@/atoms/*" are ` +
          "recognized registry dependencies. A new `@/` alias needs an ingestion and classification path first.",
      )
    } else if (!NON_DEPENDENCY.test(specifier)) {
      dependencies.add(packageName(specifier))
    }
  }
  return {
    dependencies: [...dependencies].sort(),
    registryDependencies: [...registryDependencies].sort(),
  }
}

/** The single shadcn registry item for one atom, keys ordered for stable codegen. */
export function buildRegistryItem(name: string, path: string, source: string): RegistryItem {
  const { dependencies, registryDependencies } = scanDependencies(source)
  return {
    name,
    type: "registry:ui",
    ...(registryDependencies.length > 0 ? { registryDependencies } : {}),
    ...(dependencies.length > 0 ? { dependencies } : {}),
    files: [{ path, type: "registry:ui" }],
  }
}

/** The full self-publishing `registry.json` object, derived from the atoms on disk. */
export function buildRegistry(root: string = packageRoot): Registry {
  return {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "plainworks-elements",
    homepage: "https://github.com/kbukum/plainworks",
    items: atomSources(root).map(({ name, path }) =>
      buildRegistryItem(name, path, readFileSync(join(root, path), "utf8")),
    ),
  }
}

/** The tsdown entry map: the manifest entry plus one per atom, keyed by its published subpath name. */
export function buildTsdownEntry(sources: readonly AtomSource[]): Record<string, string> {
  const entry: Record<string, string> = { index: "src/index.ts" }
  for (const { name, path } of sources) entry[name] = path
  return entry
}

export function renderRegistryTs(names: readonly string[]): string {
  const list = names.map((name) => `  "${name}",`).join("\n")
  return `${[
    "// Generated by `bun run --filter @plainworks/elements registry:codegen` from the owned atoms on",
    "// disk — do not edit by hand. The server-safe manifest of every atom the package publishes; a",
    "// codegen test holds it in lock-step with registry.json and the tsdown entries.",
    "export const ELEMENT_NAMES = [",
    list,
    "] as const",
    "",
    '/** The name of an owned atom, e.g. `"button"`. */',
    "export type ElementName = (typeof ELEMENT_NAMES)[number]",
    "",
  ].join("\n")}`
}

export function renderTsdownConfig(sources: readonly AtomSource[]): string {
  const entries = Object.entries(buildTsdownEntry(sources))
    .map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)},`)
    .join("\n")
  return `${[
    'import { type PackageBuild, preset } from "@plainworks/tsdown-config"',
    "",
    "// Generated by `registry:codegen` from the atoms on disk — do not edit the entry map by hand.",
    "// Each atom is its own client entry so consumers tree-shake to the atoms they import.",
    "export const build: PackageBuild = {",
    "  entry: {",
    entries,
    "  },",
    "  // A DOM-only package: its client components render into the browser DOM.",
    "  dom: true,",
    "  // tsdown has no CSS pipeline, so the Tailwind-source stylesheet is copied verbatim.",
    '  assets: { "styles.css": { from: "src/styles.css" } },',
    "  // The shadcn registry points at the atom sources, and the lock pins them to upstream.",
    '  files: ["registry.json", "shadcn.lock.json"],',
    "  // Vendored shadcn atoms carry no `isolatedDeclarations` annotations, so declarations are",
    "  // emitted with tsc through the vendored project, and consumers read the built atoms.",
    '  tsconfig: "tsconfig.shadcn.json",',
    '  vendored: "src/shadcn",',
    "}",
    "",
    "export default preset(build)",
    "",
  ].join("\n")}`
}

/** Regenerate registry.json, the tsdown build description, and the `.` manifest from disk. */
export function runCodegen(root: string = packageRoot): string[] {
  const names = atomNames(root)
  const registry = `${JSON.stringify(buildRegistry(root), null, 2)}\n`
  writeFileSync(join(root, "registry.json"), formatSource(registry, "registry.json"))
  writeFileSync(join(root, "src/registry.ts"), formatSource(renderRegistryTs(names), "registry.ts"))
  writeFileSync(
    join(root, "tsdown.config.ts"),
    formatSource(renderTsdownConfig(atomSources(root)), "tsdown.config.ts"),
  )
  return names
}
