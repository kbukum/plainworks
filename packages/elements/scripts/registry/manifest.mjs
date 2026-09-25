import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { formatSource } from "./format.mjs"
import { atomSources } from "./sources.mjs"

// Everything the family publishes — registry.json, the package `exports` map, the tsdown entry
// list, and the `.` manifest — is derived from the atom files on disk (`src/shadcn/` + `src/atoms/`), so none of them can
// silently drift from the actual atom set. `codegen` writes them; a test asserts re-deriving them
// produces no change.

export const packageRoot = fileURLToPath(new URL("../../", import.meta.url))

// react is a peer and `@plainworks/*` packages are workspace substrate — neither is a shadcn dep.
// The `(\/|$)` boundary keeps this from also swallowing packages that merely start with `react`
// (e.g. `react-day-picker`).
const NON_DEPENDENCY = /^(react|react-dom)(\/|$)|^@plainworks\//

/** Sorted names of every published atom, shadcn and owned. */
export function atomNames(root = packageRoot) {
  return atomSources(root).map((atom) => atom.name)
}

// Every `from "<specifier>"` in an atom, deduped in source order.
function importSpecifiers(source) {
  const specifiers = []
  const seen = new Set()
  const pattern = /from\s+["']([^"']+)["']/g
  let match = pattern.exec(source)
  while (match !== null) {
    const specifier = match[1]
    if (!seen.has(specifier)) {
      seen.add(specifier)
      specifiers.push(specifier)
    }
    match = pattern.exec(source)
  }
  return specifiers
}

// The npm package a bare specifier resolves to: the scope + name for `@scope/pkg/deep`, the first
// segment otherwise.
function packageName(specifier) {
  const segments = specifier.split("/")
  return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0]
}

/**
 * Classify an atom's imports into its shadcn `dependencies` (third-party npm packages) and
 * `registryDependencies` (sibling atoms it composes), both sorted and deduped.
 */
export function scanDependencies(source) {
  const dependencies = new Set()
  const registryDependencies = new Set()
  for (const specifier of importSpecifiers(source)) {
    const sibling = /^@\/(?:shadcn|atoms)\/(.+)$/.exec(specifier)
    if (sibling !== null) {
      registryDependencies.add(sibling[1])
    } else if (specifier.startsWith("@/")) {
      // Only sibling atoms (`@/shadcn/*`, `@/atoms/*`) are a recognized registry dependency. Any other
      // `@/` alias (e.g. a future `@/hooks/*` or `@/lib/*`) has no ingestion or classification path
      // yet, so fail loudly at codegen rather than silently emitting an incomplete registry item
      // that would break `shadcn add @plainworks/elements/<atom>` for an external consumer.
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
export function buildRegistryItem(name, path, source) {
  const { dependencies, registryDependencies } = scanDependencies(source)
  const item = { name, type: "registry:ui" }
  if (registryDependencies.length > 0) item.registryDependencies = registryDependencies
  if (dependencies.length > 0) item.dependencies = dependencies
  item.files = [{ path, type: "registry:ui" }]
  return item
}

/** The full self-publishing `registry.json` object, derived from the atoms on disk. */
export function buildRegistry(root = packageRoot) {
  return {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "plainworks-elements",
    homepage: "https://github.com/kbukum/plainworks",
    items: atomSources(root).map(({ name, path }) =>
      buildRegistryItem(name, path, readFileSync(join(root, path), "utf8")),
    ),
  }
}

/**
 * The package `exports` map: the server-safe `.` manifest, one client subpath per atom, and the
 * static `./styles.css` that registers the shipped atoms as a Tailwind `@source`.
 */
export function buildExports(names) {
  const exports = { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } }
  for (const name of names) {
    exports[`./${name}`] = { types: `./dist/${name}.d.ts`, import: `./dist/${name}.js` }
  }
  exports["./styles.css"] = "./dist/styles.css"
  return exports
}

/** The tsdown entry map: the manifest entry plus one per atom, keyed by its published subpath name. */
export function buildTsdownEntry(sources) {
  const entry = { index: "src/index.ts" }
  for (const { name, path } of sources) entry[name] = path
  return entry
}

export function renderRegistryTs(names) {
  const list = names.map((name) => `  "${name}",`).join("\n")
  return `${[
    "// Generated by \`bun run --filter @plainworks/elements registry:codegen\` from the owned atoms on",
    "// disk — do not edit by hand. The server-safe manifest of every atom the package publishes; a",
    "// codegen test holds it in lock-step with registry.json, the exports map, and the tsdown entries.",
    "export const ELEMENT_NAMES = [",
    list,
    "] as const",
    "",
    "/** The name of an owned atom, e.g. `\"button\"`. */",
    "export type ElementName = (typeof ELEMENT_NAMES)[number]",
    "",
  ].join("\n")}`
}

export function renderTsdownConfig(sources) {
  const entries = Object.entries(buildTsdownEntry(sources))
    .map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)},`)
    .join("\n")
  return `${[
    "import { preset } from \"@plainworks/tsdown-config\"",
    "",
    "// Generated by \`registry:codegen\` from the atoms on disk — do not edit the entry map by hand.",
    "// Each atom is its own client entry so consumers tree-shake to the atoms they import.",
    "export default preset({",
    "  entry: {",
    entries,
    "  },",
    "  // tsdown has no CSS pipeline, so the Tailwind-source stylesheet is copied verbatim into",
    "  // `dist`; the `./styles.css` export resolves from the build output the packaging gate covers.",
    "  copy: [{ from: \"src/styles.css\", to: \"dist\" }],",
    "  // Vendored shadcn atoms carry no \`isolatedDeclarations\` annotations, so declarations are",
    "  // emitted with tsc through the vendored project.",
    "  tsconfig: \"tsconfig.shadcn.json\",",
    "})",
    "",
  ].join("\n")}`
}

// Rewrite one top-level key of package.json in place, preserving the rest and the 2-space style.
function writePackageExports(root, names) {
  const path = join(root, "package.json")
  const pkg = JSON.parse(readFileSync(path, "utf8"))
  pkg.exports = buildExports(names)
  writeFileSync(path, formatSource(`${JSON.stringify(pkg, null, 2)}\n`, "package.json"))
}

/** Regenerate registry.json, the exports map, the tsdown entries, and the `.` manifest from disk. */
export function runCodegen(root = packageRoot) {
  const names = atomNames(root)
  const registry = `${JSON.stringify(buildRegistry(root), null, 2)}\n`
  writeFileSync(join(root, "registry.json"), formatSource(registry, "registry.json"))
  writeFileSync(join(root, "src/registry.ts"), formatSource(renderRegistryTs(names), "registry.ts"))
  writeFileSync(
    join(root, "tsdown.config.ts"),
    formatSource(renderTsdownConfig(atomSources(root)), "tsdown.config.ts"),
  )
  writePackageExports(root, names)
  return names
}
