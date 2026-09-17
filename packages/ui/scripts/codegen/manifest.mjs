import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { formatSource } from "./format.mjs"

// Everything ui publishes that can drift — the package `exports` map, the tsdown entry list, and
// the shadcn `registry.json` — is generated from the `CONCERNS` manifest below: it declares each
// published concern, its build entry, and its registry classification. A `registry` concern's
// authored folder is the only thing scanned on disk, for that item's files and dependencies.
// `codegen` writes the outputs; a test asserts re-deriving them produces no change, so the surface
// can never silently drift.

export const packageRoot = fileURLToPath(new URL("../../", import.meta.url))

// The public entries. `source` is the module tsdown builds; when a concern is `registry`,
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
    dir: "src/client/error-fallback",
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
 * The package `exports` map: the server-safe `.` manifest, one subpath per concern entry, and the
 * static `./styles.css`.
 */
export function buildExports() {
  const exports = { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } }
  for (const concern of CONCERNS) {
    exports[concern.subpath] = {
      types: `./dist/${concern.entry}.d.ts`,
      import: `./dist/${concern.entry}.js`,
    }
  }
  exports["./styles.css"] = "./dist/styles.css"
  return exports
}

/** The tsdown entry map: the neutral manifest and each concern entry. */
export function buildTsdownEntry() {
  const entry = { index: "src/index.ts" }
  for (const concern of CONCERNS) entry[concern.entry] = concernSource(concern)
  return entry
}

export function renderTsdownConfig() {
  const entries = Object.entries(buildTsdownEntry())
    .map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)},`)
    .join("\n")
  return `${[
    'import { preset } from "@plainworks/tsdown-config"',
    "",
    "// Generated by `bun run --filter @plainworks/ui codegen` — do not edit the entry map by hand.",
    "// Each concern is its own entry so consumers tree-shake to what they import; the neutral",
    "// `index` entry stays free of the client graph.",
    "export default preset({",
    "  entry: {",
    entries,
    "  },",
    "  // tsdown has no CSS pipeline, so the Tailwind-source stylesheet is copied verbatim into",
    "  // `dist`; the `./styles.css` export resolves from the build output the packaging gate covers.",
    '  copy: [{ from: "src/styles.css", to: "dist" }],',
    "})",
    "",
  ].join("\n")}`
}

// Rewrite package.json's `exports` in place, preserving the rest of the file and the 2-space style.
function writePackageExports(root) {
  const path = join(root, "package.json")
  const pkg = JSON.parse(readFileSync(path, "utf8"))
  pkg.exports = buildExports()
  writeFileSync(path, formatSource(`${JSON.stringify(pkg, null, 2)}\n`, "package.json"))
}

/**
 * Regenerate `registry.json`, the tsdown entries, and the package exports map from disk.
 */
export function runCodegen(root = packageRoot) {
  const registry = `${JSON.stringify(buildRegistry(root), null, 2)}\n`
  writeFileSync(join(root, "registry.json"), formatSource(registry, "registry.json"))
  writeFileSync(
    join(root, "tsdown.config.ts"),
    formatSource(renderTsdownConfig(), "tsdown.config.ts"),
  )
  writePackageExports(root)
}
