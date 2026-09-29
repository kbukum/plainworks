import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { formatSource } from "./format"

// The tsdown build description and the shadcn `registry.json` are generated from the `CONCERNS`
// manifest below. Each concern lists its published modules, and every module becomes its own
// `@plainworks/ui/<concern>/<module>` subpath, so an import names exactly one component and there
// is no aggregate to pull in the rest. A `registry` concern also becomes one shadcn item, built by
// scanning its folders for files and dependencies. `codegen` writes the outputs, and a test asserts
// re-deriving them produces no change. The package `exports` and `files` follow from the build
// description through `bun run sync-shape`, like every other package.

export const packageRoot: string = fileURLToPath(new URL("../../", import.meta.url))

/** A published concern: its folders, the modules it publishes, and its registry classification. */
export interface Concern {
  /** The first subpath segment, e.g. `forms` for `@plainworks/ui/forms/text-field`. */
  readonly name: string
  /** The folders under `src/` holding the concern's modules. */
  readonly dirs: readonly string[]
  /**
   * The published modules, each resolved in `dirs` as `<module>.ts(x)` or a `<module>/index.ts`
   * component folder, and each published at `<name>/<module>`.
   */
  readonly modules: readonly string[]
  /** Helper modules (paths under `src/`) that stay private to the concern's components. */
  readonly internal?: readonly string[]
  /** The shadcn item type; a concern without it publishes entries but is not a copyable item. */
  readonly registry?: "ui"
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

export const CONCERNS: readonly Concern[] = [
  {
    name: "hooks",
    dirs: ["hooks", "client/hooks"],
    modules: [
      "use-controllable-state",
      "use-disclosure",
      "use-list-state",
      "use-selection",
      "use-clipboard",
      "use-keyboard-shortcuts",
      "use-media-query",
    ],
  },
  {
    name: "layout",
    dirs: ["client/layout"],
    modules: ["stack", "grid", "split", "page", "page-header", "section", "toolbar"],
    internal: ["client/layout/gap.ts"],
    registry: "ui",
  },
  {
    name: "feedback",
    dirs: ["client/feedback"],
    modules: ["async-state", "callout", "empty-state", "error-state", "loading-state", "spinner"],
    registry: "ui",
  },
  {
    name: "overlays",
    dirs: ["client/overlays"],
    modules: ["drawer", "modal"],
    internal: ["client/overlays/body.tsx"],
    registry: "ui",
  },
  {
    name: "display",
    dirs: ["client/display"],
    modules: ["date-value", "number-value", "status-badge"],
    registry: "ui",
  },
  {
    name: "navigation",
    dirs: ["client/navigation"],
    modules: ["breadcrumbs", "nav-list"],
    registry: "ui",
  },
  {
    name: "theme",
    dirs: ["client/theme"],
    modules: ["theme-mode-group", "theme-mode-menu", "theme-mode-options"],
    registry: "ui",
  },
  {
    name: "forms",
    dirs: ["client/forms"],
    modules: [
      "form",
      "form-context",
      "form-data",
      "form-submit",
      "field",
      "text-field",
      "number-field",
      "date-field",
      "textarea-field",
      "select-field",
      "checkbox-field",
      "switch-field",
    ],
    internal: ["client/forms/field-props.ts"],
    registry: "ui",
  },
  { name: "shell", dirs: ["client/shell"], modules: ["app-shell"], registry: "ui" },
  {
    name: "data",
    dirs: ["client/data"],
    modules: ["data-table", "filter-bar", "filter-model", "pagination", "pagination-range"],
    registry: "ui",
  },
]

// react is a peer and a relative specifier is a file already shipped inside the same concern —
// neither is an npm dependency. Published workspace packages (`@plainworks/elements`,
// `@plainworks/theme`) are retained in `dependencies` so external consumers resolve them as npm
// packages without requiring source import rewriting by the shadcn CLI.
const NON_DEPENDENCY = /^(react|react-dom)(\/|$)|^\.\.?\//

// The package-relative source of one published module: a `<module>.ts(x)` file or a `<module>/`
// component folder with an `index.ts` barrel, found in exactly one of the concern's folders.
function moduleSource(root: string, concern: Concern, module: string): string {
  const found = concern.dirs.flatMap((dir) =>
    [`${module}.ts`, `${module}.tsx`, `${module}/index.ts`]
      .map((file) => `src/${dir}/${file}`)
      .filter((path) => existsSync(join(root, path))),
  )
  if (found.length !== 1) {
    throw new Error(
      `ui concern "${concern.name}" module "${module}" must resolve to exactly one source; found ${found.length}.`,
    )
  }
  return found[0] as string
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

// The authored source files of a concern folder, component folders included — every module except
// the tests — sorted for stable codegen.
function concernFiles(root: string, dir: string): string[] {
  return readdirSync(join(root, dir), { recursive: true, encoding: "utf8" })
    .filter(
      (entry) =>
        (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
        !entry.endsWith(".test.ts") &&
        !entry.endsWith(".test.tsx"),
    )
    .map((entry) => `${dir}/${entry.split("\\").join("/")}`)
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
 * Every source file a shadcn registry item must ship to install cleanly: the concern folders' own
 * modules plus the transitive closure of the relative imports that escape them (a shared hook, a
 * lower-band component). Without this, an item that imports `../../hooks/use-selection` would
 * install with an unresolved module. Sorted and deduped for stable codegen.
 */
export function collectItemFiles(root: string, dirs: readonly string[]): string[] {
  const seen = new Set(dirs.flatMap((dir) => concernFiles(root, dir)))
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

/** One shadcn registry item for a concern's folders, keys ordered for stable codegen. */
export function buildRegistryItem(
  name: string,
  dirs: readonly string[],
  type: string,
  root: string = packageRoot,
): RegistryItem {
  const files = collectItemFiles(root, dirs)
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
    items: CONCERNS.flatMap((concern) =>
      concern.registry === undefined
        ? []
        : [
            buildRegistryItem(
              concern.name,
              concern.dirs.map((dir) => `src/${dir}`),
              `registry:${concern.registry}`,
              root,
            ),
          ],
    ),
  }
}

/** The tsdown entry map: the neutral `index` entry and one `<concern>/<module>` entry per module. */
export function buildTsdownEntry(root: string = packageRoot): Record<string, string> {
  const entry: Record<string, string> = { index: "src/index.ts" }
  for (const concern of CONCERNS) {
    for (const module of concern.modules) {
      entry[`${concern.name}/${module}`] = moduleSource(root, concern, module)
    }
  }
  return entry
}

export function renderTsdownConfig(root: string = packageRoot): string {
  const entries = Object.entries(buildTsdownEntry(root))
    .map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)},`)
    .join("\n")
  return `${[
    'import { type PackageBuild, preset } from "@plainworks/tsdown-config"',
    "",
    "// Generated by `bun run --filter @plainworks/ui codegen` — do not edit the entry map by hand.",
    "// Each component is its own `<concern>/<module>` entry, so an import loads only that component;",
    "// the neutral `index` entry stays free of the client graph.",
    "export const build: PackageBuild = {",
    "  entry: {",
    entries,
    "  },",
    "  // A DOM-only package: its client components render into the browser DOM.",
    "  dom: true,",
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
    formatSource(renderTsdownConfig(root), "tsdown.config.ts"),
  )
}
