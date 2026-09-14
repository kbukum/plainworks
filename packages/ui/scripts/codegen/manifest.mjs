import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { formatSource } from "./format.mjs"

// Everything ui publishes that can drift from disk — the atom re-export shims, the package `exports`
// map, the tsdown entry list, and the shadcn `registry.json` — is derived from one source of truth:
// the concern folders on disk plus the sibling `@plainworks/elements` registry. `codegen` writes
// them; a test asserts re-deriving them produces no change, so the surface can never silently drift.

export const packageRoot = fileURLToPath(new URL("../../", import.meta.url))

// Generated atom re-export shims live here; a codegen sweep is the only writer.
const ATOM_REEXPORT_DIR = "src/client/atoms"

// The non-atom public entries. `source` is the module tsdown builds; when a concern is `registry`,
// its `dir` (a folder of authored source) is scanned for that shadcn item's files and dependencies.
// `registry` is the shadcn item type; a concern without it is a plain published entry (an aggregate
// barrel or a re-export wrapper) that ships in the package but is not a standalone copyable item.
const CONCERNS = [
  { subpath: "./client", entry: "client", source: "src/client.ts" },
  { subpath: "./hooks", entry: "hooks", source: "src/client/hooks/index.ts" },
  { subpath: "./layout", entry: "layout", dir: "src/client/layout", registry: "ui" },
  { subpath: "./feedback", entry: "feedback", dir: "src/client/feedback", registry: "ui" },
  { subpath: "./overlays", entry: "overlays", dir: "src/client/overlays", registry: "ui" },
  { subpath: "./display", entry: "display", dir: "src/client/display", registry: "ui" },
  { subpath: "./navigation", entry: "navigation", dir: "src/client/navigation", registry: "ui" },
  { subpath: "./data-table", entry: "data-table", dir: "src/client/data-table", registry: "ui" },
  { subpath: "./forms", entry: "forms", dir: "src/client/forms", registry: "ui" },
  { subpath: "./list", entry: "list", dir: "src/client/list", registry: "ui" },
  {
    subpath: "./error-fallback",
    entry: "error-fallback",
    dir: "src/client/components/error-fallback",
    registry: "ui",
  },
  { subpath: "./theme", entry: "theme-client", source: "src/client/theme/index.ts" },
]

// react is a peer and a relative specifier is a file already shipped inside the same concern —
// neither is an npm dependency. Published workspace packages (`@plainworks/elements`,
// `@plainworks/theme`) are retained in `dependencies` so external consumers resolve them as npm
// packages without requiring source import rewriting by the shadcn CLI.
const NON_DEPENDENCY = /^(react|react-dom)(\/|$)|^\.\.?\//

function concernSource(concern) {
  return concern.source ?? `${concern.dir}/index.ts`
}

/**
 * Sorted names of the atoms ui re-exports, read from the sibling `@plainworks/elements` registry so
 * the re-export set can never drift from what elements actually ships. Reading the committed
 * registry (not a live network call) keeps codegen offline.
 */
export function atomNames(elementsRegistryPath = join(packageRoot, "../elements/registry.json")) {
  const registry = JSON.parse(readFileSync(elementsRegistryPath, "utf8"))
  return registry.items.map((item) => item.name).sort()
}

// Every `from "<specifier>"` in a source file, deduped in source order.
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
 * Classify a composite's imports into its shadcn `dependencies` (npm packages including published
 * workspace substrate such as `@plainworks/elements` and `@plainworks/theme`) and
 * `registryDependencies`, both sorted and deduped. Relative imports ship inside the package and
 * are excluded here.
 */
export function scanDependencies(source) {
  const dependencies = new Set()
  const registryDependencies = new Set()
  for (const specifier of importSpecifiers(source)) {
    if (!NON_DEPENDENCY.test(specifier)) {
      dependencies.add(packageName(specifier))
    }
  }
  return {
    dependencies: [...dependencies].sort(),
    registryDependencies: [...registryDependencies].sort(),
  }
}

// The authored source files of a concern folder — every module except the re-export barrel and the
// tests — sorted for stable codegen.
function concernFiles(root, dir) {
  return readdirSync(join(root, dir))
    .filter(
      (entry) =>
        (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
        !entry.endsWith(".test.ts") &&
        !entry.endsWith(".test.tsx") &&
        entry !== "index.ts",
    )
    .map((entry) => `${dir}/${entry}`)
    .sort()
}

// Resolve a relative import from `fromFile` to the package-relative path of the module it names, or
// `null` for a specifier that resolves nowhere. Bare/`@plainworks` specifiers are not relative and
// return `null`; a directory specifier resolves through its `index` barrel.
function resolveRelativeImport(root, fromFile, specifier) {
  if (!specifier.startsWith(".")) return null
  const base = join(dirname(join(root, fromFile)), specifier)
  const candidates = [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return relative(root, candidate).split("\\").join("/")
  }
  return null
}

/**
 * Every source file a shadcn registry item must ship to install cleanly: the concern folder's own
 * modules plus the transitive closure of the relative imports that escape it (a shared hook, a
 * sibling type). Without this, an item that imports `../../hooks` would install with an unresolved
 * module. Sorted and deduped for stable codegen.
 */
export function collectItemFiles(root, dir) {
  const seen = new Set(concernFiles(root, dir))
  const queue = [...seen]
  while (queue.length > 0) {
    const file = queue.shift()
    for (const specifier of importSpecifiers(readFileSync(join(root, file), "utf8"))) {
      const resolved = resolveRelativeImport(root, file, specifier)
      if (resolved !== null && !seen.has(resolved)) {
        seen.add(resolved)
        queue.push(resolved)
      }
    }
  }
  return [...seen].sort()
}

/** One shadcn registry item for a concern folder, keys ordered for stable codegen. */
export function buildRegistryItem(name, dir, type, root = packageRoot) {
  const files = collectItemFiles(root, dir)
  const dependencies = new Set()
  const registryDependencies = new Set()
  for (const file of files) {
    const scan = scanDependencies(readFileSync(join(root, file), "utf8"))
    for (const dep of scan.dependencies) dependencies.add(dep)
    for (const dep of scan.registryDependencies) registryDependencies.add(dep)
  }
  const item = { name, type }
  if (registryDependencies.size > 0) item.registryDependencies = [...registryDependencies].sort()
  if (dependencies.size > 0) item.dependencies = [...dependencies].sort()
  item.files = files.map((path) => ({ path, type }))
  return item
}

/** The full self-publishing `registry.json` object, derived from the registry concerns on disk. */
export function buildRegistry(root = packageRoot) {
  return {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "plainworks-ui",
    homepage: "https://github.com/kbukum/plainworks",
    items: CONCERNS.filter((concern) => concern.registry).map((concern) =>
      buildRegistryItem(concern.subpath.slice(2), concern.dir, `registry:${concern.registry}`, root),
    ),
  }
}

/**
 * The package `exports` map: the server-safe `.` manifest, one subpath per concern entry, one
 * client subpath per re-exported atom, and the static `./styles.css`.
 */
export function buildExports(atoms) {
  const exports = { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } }
  for (const concern of CONCERNS) {
    exports[concern.subpath] = {
      types: `./dist/${concern.entry}.d.ts`,
      import: `./dist/${concern.entry}.js`,
    }
  }
  for (const atom of atoms) {
    exports[`./${atom}`] = { types: `./dist/${atom}.d.ts`, import: `./dist/${atom}.js` }
  }
  exports["./styles.css"] = "./src/styles.css"
  return exports
}

/** The tsdown entry map: the neutral manifest, each concern entry, and one entry per atom shim. */
export function buildTsdownEntry(atoms) {
  const entry = { index: "src/index.ts" }
  for (const concern of CONCERNS) entry[concern.entry] = concernSource(concern)
  for (const atom of atoms) entry[atom] = `${ATOM_REEXPORT_DIR}/${atom}.ts`
  return entry
}

// The shim is a fixed template with nothing for Biome to reformat, so it is rendered directly
// rather than through `formatSource`: format-clean by construction, and no per-atom subprocess
// (spawning Biome once per atom is what made the lock-step test slow enough to time out in CI).
/** The `"use client"` re-export shim source for one atom, format-clean by construction. */
export function renderAtomReexport(name) {
  return `${[
    '"use client"',
    "",
    "// Generated by `bun run --filter @plainworks/ui codegen` — do not edit by hand. A",
    "// tree-shakeable re-export of one @plainworks/elements atom, so a consumer can pull the atom",
    "// and ui's composites from one package. The dependency direction (ui → elements) and the",
    "// atom's provenance live in the elements registry.",
    `export * from "@plainworks/elements/${name}"`,
    "",
  ].join("\n")}`
}

export function renderTsdownConfig(atoms) {
  const entries = Object.entries(buildTsdownEntry(atoms))
    .map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)},`)
    .join("\n")
  return `${[
    'import { preset } from "@plainworks/tsdown-config"',
    "",
    "// Generated by `bun run --filter @plainworks/ui codegen` — do not edit the entry map by hand.",
    "// Each concern and each re-exported atom is its own entry so consumers tree-shake to what they",
    "// import; the neutral `index` entry stays free of the client graph.",
    "export default preset({",
    "  entry: {",
    entries,
    "  },",
    "})",
    "",
  ].join("\n")}`
}

// Rewrite package.json's `exports` in place, preserving the rest of the file and the 2-space style.
function writePackageExports(root, atoms) {
  const path = join(root, "package.json")
  const pkg = JSON.parse(readFileSync(path, "utf8"))
  pkg.exports = buildExports(atoms)
  writeFileSync(path, formatSource(`${JSON.stringify(pkg, null, 2)}\n`, "package.json"))
}

// Write one shim per atom and delete any stale shim whose atom elements no longer ships, so the
// generated directory is an exact mirror of the atom set.
function writeAtomReexports(root, atoms) {
  const dir = join(root, ATOM_REEXPORT_DIR)
  mkdirSync(dir, { recursive: true })
  const wanted = new Set(atoms.map((name) => `${name}.ts`))
  for (const existing of readdirSync(dir)) {
    if (existing.endsWith(".ts") && !wanted.has(existing)) rmSync(join(dir, existing))
  }
  for (const name of atoms) {
    writeFileSync(join(dir, `${name}.ts`), renderAtomReexport(name))
  }
}

/**
 * Regenerate the atom re-export shims, `registry.json`, the tsdown entries, and the package exports
 * map from disk. `elementsRegistryPath` is injected so the orchestration test can run offline.
 */
export function runCodegen(root = packageRoot, elementsRegistryPath) {
  const atoms = atomNames(elementsRegistryPath ?? join(root, "../elements/registry.json"))
  writeAtomReexports(root, atoms)
  const registry = `${JSON.stringify(buildRegistry(root), null, 2)}\n`
  writeFileSync(join(root, "registry.json"), formatSource(registry, "registry.json"))
  writeFileSync(
    join(root, "tsdown.config.ts"),
    formatSource(renderTsdownConfig(atoms), "tsdown.config.ts"),
  )
  writePackageExports(root, atoms)
  return atoms
}
