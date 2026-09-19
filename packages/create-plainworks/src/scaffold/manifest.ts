// The manifest rewriter: turn a template `package.json` into a standalone one. A template declares
// its deps exactly as an in-repo package does — `@plainworks/*` at `workspace:*`, third-party at
// `catalog:` — because those are the only ranges the monorepo keeps a single source of truth for.
// A generated project lives outside the workspace, where neither protocol resolves, so every such
// range is rewritten to the concrete version the initializer shipped with (see `versions.ts`). A
// dep that references a protocol with no known pin fails loudly rather than emitting a broken
// manifest.

/** A dependency section value: dependency name -> semver range. */
export type DependencyMap = Record<string, string>

/** The subset of `package.json` fields the rewriter reads and rewrites. */
export interface PackageManifest {
  name?: string
  version?: string
  dependencies?: DependencyMap
  devDependencies?: DependencyMap
  peerDependencies?: DependencyMap
  optionalDependencies?: DependencyMap
  [key: string]: unknown
}

/** The pinned versions the rewriter resolves protocol ranges against. */
export interface VersionResolvers {
  /** Published `@plainworks/*` package -> version, for `workspace:` ranges. */
  readonly plainworksVersions: DependencyMap
  /** Third-party dependency -> range, for `catalog:` ranges. */
  readonly catalogVersions: DependencyMap
}

/** Inputs for {@link rewriteManifest}. */
export interface RewriteManifestOptions extends VersionResolvers {
  /** The generated project name, written to `manifest.name`. */
  readonly projectName: string
}

/** Raised when a template dep uses a protocol range with no known concrete version. */
export class UnresolvedDependencyError extends Error {
  constructor(
    readonly dependency: string,
    readonly range: string,
  ) {
    super(
      `Cannot pin "${dependency}": "${range}" but no concrete version is known. Run \`bun run sync-versions\` if the catalog or a package version changed.`,
    )
    this.name = "UnresolvedDependencyError"
  }
}

const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const

/** Resolve one dependency's range, replacing a `workspace:`/`catalog:` protocol with a pinned version. */
function pinRange(name: string, range: string, resolvers: VersionResolvers): string {
  if (range.startsWith("workspace:")) {
    const pinned = resolvers.plainworksVersions[name]
    if (pinned === undefined) throw new UnresolvedDependencyError(name, range)
    return pinned
  }
  if (range.startsWith("catalog:")) {
    const pinned = resolvers.catalogVersions[name]
    if (pinned === undefined) throw new UnresolvedDependencyError(name, range)
    return pinned
  }
  return range
}

/** Rewrite one dependency section, pinning every protocol range. */
function pinSection(section: DependencyMap, resolvers: VersionResolvers): DependencyMap {
  const pinned: DependencyMap = {}
  for (const [name, range] of Object.entries(section)) {
    pinned[name] = pinRange(name, range, resolvers)
  }
  return pinned
}

/**
 * Produce the standalone `package.json` for a generated project: the template name replaced with
 * the chosen project name, `version` reset to `0.0.0`, and every `workspace:`/`catalog:` range
 * pinned to a concrete version. The input is not mutated.
 */
export function rewriteManifest(
  template: PackageManifest,
  options: RewriteManifestOptions,
): PackageManifest {
  const rewritten: PackageManifest = {
    ...template,
    name: options.projectName,
    version: "0.0.0",
  }
  for (const section of DEPENDENCY_SECTIONS) {
    const deps = template[section]
    if (deps !== undefined) rewritten[section] = pinSection(deps, options)
  }
  return rewritten
}
