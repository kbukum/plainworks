import type { CliBuild } from "./cli-preset.ts"

/** A non-JS file a package exports from `dist`, such as a stylesheet. */
export type PackageAsset =
  /** Copied verbatim from `src` by the build. */
  | { readonly from: string }
  /** Written into `dist` by the package's own build step after tsdown runs. */
  | { readonly generatedBy: string }

/**
 * What a package builds and exports — the one list its `tsdown.config.ts` declares and every
 * derived file (the `exports` map, the published `files`) is generated from.
 */
export interface PackageBuild {
  /**
   * Entry points by public subpath: `index` is the `.` entry, and `client` or `web-storage` is
   * published as `./client` or `./web-storage`. The key is also the `dist` file name.
   */
  readonly entry: Readonly<Record<string, string>>
  /** Non-JS files the package exports, by their `dist` file name (e.g. `styles.css`). */
  readonly assets?: Readonly<Record<string, PackageAsset>>
  /**
   * The project declarations are emitted from. Defaults to `tsconfig.src.json` when present, else
   * tsdown's own resolution. A project with `isolatedDeclarations` emits through Oxc; one without
   * it emits through tsc, for sources that cannot carry explicit annotations (vendored code).
   */
  readonly tsconfig?: string
  /**
   * A `src` folder of vendored code that only compiles under its own relaxed project. Entries from
   * it resolve to `dist` even inside the repo, so no stricter consumer compiles its source.
   */
  readonly vendored?: string
  /** Published files beyond `dist` and `src`, such as a `registry.json` manifest. */
  readonly files?: readonly string[]
  /**
   * Declares a DOM-only package (`theme`, `elements`, `ui`, `devtools`, `testkit`), whose `.` and
   * `./client` projects may add the DOM lib. Every other package keeps DOM to its adapter, test,
   * and tooling projects, so its `./client` also runs on React Native.
   */
  readonly dom?: true
}

/** A `tsdown.config.ts` build description that breaks the shape every package shares. */
export class BuildShapeError extends Error {
  override readonly name = "BuildShapeError"
}

// A public subpath: lowercase kebab-case segments joined by `/`, never ending in `index`.
const SUBPATH = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*)*$/

/** Throws a {@link BuildShapeError} unless `build` follows the shared package shape. */
export function assertPackageBuild(build: PackageBuild): void {
  if (build.entry.index === undefined) {
    throw new BuildShapeError("The build has no `index` entry for the package's `.` export.")
  }
  for (const [key, source] of Object.entries(build.entry)) {
    if (!SUBPATH.test(key) || key.endsWith("/index")) {
      throw new BuildShapeError(
        `The entry "${key}" is not a public subpath; name it the way consumers import it (e.g. "web-storage").`,
      )
    }
    if (!source.startsWith("src/")) {
      throw new BuildShapeError(`The entry "${key}" builds ${source}, which is outside src.`)
    }
  }
  assertExtraFiles(build.files, ["dist", "src"])
  for (const [name, asset] of Object.entries(build.assets ?? {})) {
    if ("from" in asset && asset.from.split("/").at(-1) !== name) {
      throw new BuildShapeError(
        `The asset "${name}" copies ${asset.from}; name it after the file it copies.`,
      )
    }
  }
}

/** Throws a {@link BuildShapeError} when an extra file repeats one the shape already publishes. */
export function assertExtraFiles(
  files: readonly string[] | undefined,
  published: readonly string[],
): void {
  for (const file of files ?? []) {
    if (published.includes(file)) {
      throw new BuildShapeError(`The file "${file}" is already published; drop it from \`files\`.`)
    }
  }
}

/**
 * The package `files` list for a build. A library ships `src` (tests excluded) next to `dist`,
 * because its declaration maps point there; a command ships only its bundled `dist`.
 */
export function renderFiles(build: PackageBuild | CliBuild): string[] {
  const shape = "bin" in build ? ["dist"] : ["dist", "src", "!src/**/*.test.*"]
  return [...shape, ...(build.files ?? [])]
}
