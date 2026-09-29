import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { formatSource } from "./format"

// The tsdown build description and the shadcn `registry.json` are generated from the `CONCERNS`
// manifest below: it declares each published concern, its build entry, and its registry
// classification. A `registry` concern's authored folder is the only thing scanned on disk, for
// that item's files and dependencies. `codegen` writes the outputs, and a test asserts re-deriving
// them produces no change. The package `exports` and `files` follow from the build description
// through `bun run sync-shape`, like every other package.

export const packageRoot: string = fileURLToPath(new URL("../../", import.meta.url))

/** A published entry: a build `source`, or a registry `dir` scanned for its files and deps. */
interface Concern {
  /** The public subpath under the package, e.g. `data-table` for `@plainworks/ui/data-table`. */
  subpath: string
  source?: string
  dir?: string
  registry?: string
}

/** A source file's imports split into npm deps and sibling registry deps. */
export interface DependencyScan {
  dependencies: string[]
  registryDependencies: string[]
}

/** One file a shadcn registry item ships, tagged with its item type. */
export interface RegistryFile {
  path: string
  type: string
}

/** A single shadcn `registry.json` item derived from one concern folder. */
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

// The public entries. `source` is the module tsdown builds; when a concern is `registry`,
// its `dir` (a folder of authored source) is scanned for that shadcn item's files and dependencies.
// `registry` is the shadcn item type; a concern without it is a plain published entry (an aggregate
// barrel or a re-export wrapper) that ships in the package but is not a standalone copyable item.
const CONCERNS: readonly Concern[] = [
  { subpath: "client", source: "src/client.ts" },
  { subpath: "hooks", source: "src/client/hooks/index.ts" },
  { subpath: "layout", dir: "src/client/layout", registry: "ui" },
  { subpath: "feedback", dir: "src/client/feedback", registry: "ui" },
  { subpath: "overlays", dir: "src/client/overlays", registry: "ui" },
  { subpath: "display", dir: "src/client/display", registry: "ui" },
  { subpath: "navigation", dir: "src/client/navigation", registry: "ui" },
  { subpath: "data-table", dir: "src/client/data-table", registry: "ui" },
  { subpath: "forms", dir: "src/client/forms", registry: "ui" },
  { subpath: "list", dir: "src/client/list", registry: "ui" },
  { subpath: "page", dir: "src/client/page", registry: "ui" },
  { subpath: "shell", dir: "src/client/shell", registry: "ui" },
  { subpath: "theme", source: "src/client/theme/index.ts" },
]

// react is a peer and a relative specifier is a file already shipped inside the same concern —
// neither is an npm dependency. Published workspace packages (`@plainworks/elements`,
// `@plainworks/theme`) are retained in `dependencies` so external consumers resolve them as npm
// packages without requiring source import rewriting by the shadcn CLI.
const NON_DEPENDENCY = /^(react|react-dom)(\/|$)|^\.\.?\//

function concernSource(concern: Concern): string {
  return concern.source ?? `${concern.dir}/index.ts`
}

// Every `from "<specifier>"` in a source file, deduped in source order.
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
 * Classify a composite's imports into its shadcn `dependencies` (npm packages including published
 * workspace substrate such as `@plainworks/elements` and `@plainworks/theme`) and
 * `registryDependencies`, both sorted and deduped. Relative imports ship inside the package and
 * are excluded here.
 */
export function scanDependencies(source: string): DependencyScan {
  const dependencies = new Set<string>()
  const registryDependencies = new Set<string>()
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
function concernFiles(root: string, dir: string): string[] {
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
function resolveRelativeImport(root: string, fromFile: string, specifier: string): string | null {
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
export function collectItemFiles(root: string, dir: string): string[] {
  const seen = new Set(concernFiles(root, dir))
  const queue = [...seen]
  while (queue.length > 0) {
    const file = queue.shift()
    if (file === undefined) continue
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
export function buildRegistryItem(
  name: string,
  dir: string,
  type: string,
  root: string = packageRoot,
): RegistryItem {
  const files = collectItemFiles(root, dir)
  const dependencies = new Set<string>()
  const registryDependencies = new Set<string>()
  for (const file of files) {
    const scan = scanDependencies(readFileSync(join(root, file), "utf8"))
    for (const dep of scan.dependencies) dependencies.add(dep)
    for (const dep of scan.registryDependencies) registryDependencies.add(dep)
  }
  return {
    name,
    type,
    ...(registryDependencies.size > 0
      ? { registryDependencies: [...registryDependencies].sort() }
      : {}),
    ...(dependencies.size > 0 ? { dependencies: [...dependencies].sort() } : {}),
    files: files.map((path) => ({ path, type })),
  }
}

/** The full self-publishing `registry.json` object, derived from the registry concerns on disk. */
export function buildRegistry(root: string = packageRoot): Registry {
  return {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "plainworks-ui",
    homepage: "https://github.com/kbukum/plainworks",
    items: CONCERNS.filter((concern) => concern.registry !== undefined).map((concern) => {
      if (concern.dir === undefined || concern.registry === undefined) {
        throw new Error(`registry concern ${concern.subpath} must declare a dir and registry type.`)
      }
      return buildRegistryItem(concern.subpath, concern.dir, `registry:${concern.registry}`, root)
    }),
  }
}

/** The tsdown entry map: the neutral manifest and each concern entry. */
export function buildTsdownEntry(): Record<string, string> {
  const entry: Record<string, string> = { index: "src/index.ts" }
  for (const concern of CONCERNS) entry[concern.subpath] = concernSource(concern)
  return entry
}

export function renderTsdownConfig(): string {
  const entries = Object.entries(buildTsdownEntry())
    .map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)},`)
    .join("\n")
  return `${[
    'import { type PackageBuild, preset } from "@plainworks/tsdown-config"',
    "",
    "// Generated by `bun run --filter @plainworks/ui codegen` — do not edit the entry map by hand.",
    "// Each concern is its own entry so consumers tree-shake to what they import; the neutral",
    "// `index` entry stays free of the client graph.",
    "export const build: PackageBuild = {",
    "  entry: {",
    entries,
    "  },",
    "  // tsdown has no CSS pipeline, so the Tailwind-source stylesheet is copied verbatim.",
    '  assets: { "styles.css": { from: "src/styles.css" } },',
    "  // The shadcn registry points at authored `src` files, so it ships beside them.",
    '  files: ["registry.json"],',
    "}",
    "",
    "export default preset(build)",
    "",
  ].join("\n")}`
}

/** Regenerate `registry.json` and the tsdown build description from disk. */
export function runCodegen(root: string = packageRoot): void {
  const registry = buildRegistry(root)
  writeFileSync(
    join(root, "registry.json"),
    formatSource(`${JSON.stringify(registry, null, 2)}\n`, "registry.json"),
  )
  writeFileSync(
    join(root, "tsdown.config.ts"),
    formatSource(renderTsdownConfig(), "tsdown.config.ts"),
  )
}
