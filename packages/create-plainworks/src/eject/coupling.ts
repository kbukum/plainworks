import { readdirSync, readFileSync } from "node:fs"
import { isBuiltin } from "node:module"
import { join, relative, resolve } from "node:path"
import * as ts from "typescript"
import type { PackageManifest } from "../scaffold/manifest"
import { isSkippedEntry, NEUTRALIZED_TSCONFIG_EXTENDS } from "./config"

// The ejectability enforcement gate. Eject neutralizes a finite, explicit set of monorepo couplings
// — `workspace:`/`catalog:` dependency ranges, the base `tsconfig` an app extends, the workspace
// task/test config. This gate proves the source app couples to the monorepo through *only* those
// known channels, so eject's transform is complete: every `@plainworks/*` runtime dependency is a
// published package (a private/internal one like `@plainworks/demo` can never be pinned), every
// `@plainworks/*` import is a declared dependency the version rewrite covers, no source import
// escapes the app directory, and the `tsconfig` extends only the base config eject inlines. A new,
// un-neutralized coupling fails this check rather than emitting a broken standalone project.

/** Raised when a source app couples to the monorepo through a channel eject does not neutralize. */
export class EjectCouplingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EjectCouplingError"
  }
}

/** Inputs for {@link assertEjectable}. */
export interface AssertEjectableOptions {
  /** Absolute path of the source app (an `apps/*` member) being ejected. */
  readonly appDir: string
  /** Absolute path of the monorepo root, used to resolve published `@plainworks/*` packages. */
  readonly repoRoot: string
}

/** Read and parse a JSON file. */
function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T
}

/** Read and parse a JSONC config file (tsconfig), tolerating comments and trailing commas. */
function readJsonc<T>(path: string): T {
  const content = readFileSync(path, "utf8")
  const parsed = ts.parseConfigFileTextToJson(path, content)
  if (parsed.error) {
    const message = ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n")
    throw new EjectCouplingError(`Failed to parse ${path}: ${message}`)
  }
  return parsed.config as T
}

/** The base package name of an import/dependency, dropping any `/subpath` (`@scope/pkg/x` -> `@scope/pkg`). */
function basePackage(specifier: string): string {
  const parts = specifier.split("/")
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? specifier)
}

/** Every published (non-private) `@plainworks/*` package name under `packages/`. */
function publishedPlainworksPackages(repoRoot: string): Set<string> {
  const packagesDir = join(repoRoot, "packages")
  const names = new Set<string>()
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    let manifest: PackageManifest
    try {
      manifest = readJson<PackageManifest>(join(packagesDir, entry.name, "package.json"))
    } catch {
      continue
    }
    if (manifest.private === true || typeof manifest.name !== "string") continue
    if (manifest.name.startsWith("@plainworks/")) names.add(manifest.name)
  }
  return names
}

// Every JS/TS module extension eject may copy — source, JSX, and root config (`next.config.ts`,
// `postcss.config.mjs`), all of which are validated for escaping couplings.
const MODULE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]

/** Every JS/TS module under an app directory, recursively (skipping build output). */
function moduleFiles(appDir: string, dir = appDir): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (isSkippedEntry(relative(appDir, path))) continue
    if (entry.isDirectory()) {
      files.push(...moduleFiles(appDir, path))
    } else if (MODULE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      files.push(path)
    }
  }
  return files
}

/**
 * Every module specifier a file imports, re-exports, or `require`s — extracted with the TypeScript
 * preprocessor rather than a regex, so it also catches side-effect imports (`import "./setup"`) and
 * dynamic `import()`/`require()` that a regex misses.
 */
function importSpecifiers(source: string): string[] {
  return ts.preProcessFile(source, true, true).importedFiles.map((ref) => ref.fileName)
}

const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const

/** Assert every preserved `@plainworks/*` dependency resolves to a published package. */
function assertPublishedDependencies(manifest: PackageManifest, published: Set<string>): void {
  for (const section of DEPENDENCY_SECTIONS) {
    for (const name of Object.keys(manifest[section] ?? {})) {
      if (!name.startsWith("@plainworks/")) continue
      if (!published.has(name)) {
        throw new EjectCouplingError(
          `"${name}" is a private/internal package with no published version — eject cannot pin it. A generated app may depend only on published @plainworks/* packages.`,
        )
      }
    }
  }
}

/** Every stylesheet under an app directory, recursively (skipping build output). */
function cssFiles(appDir: string, dir = appDir): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (isSkippedEntry(relative(appDir, path))) continue
    if (entry.isDirectory()) {
      files.push(...cssFiles(appDir, path))
    } else if (entry.name.endsWith(".css")) {
      files.push(path)
    }
  }
  return files
}

/**
 * Extract external or package specifiers referenced by CSS `@import` and `url()` declarations.
 * Excludes remote protocols (`http:`, `https:`), inline data URIs (`data:`), and SVG fragments
 * (`#`).
 */
function cssSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const importRegex = /@import\s+(?:url\(\s*['"]?([^'")]+)['"]?\s*\)|['"]([^'"]+)['"])/g
  for (const match of source.matchAll(importRegex)) {
    const spec = match[1] ?? match[2]
    if (spec) specifiers.push(spec.trim())
  }
  const urlRegex = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g
  for (const match of source.matchAll(urlRegex)) {
    const spec = match[1]
    if (spec) specifiers.push(spec.trim())
  }
  return specifiers
}

function isRemoteOrInlineAsset(specifier: string): boolean {
  return (
    specifier.startsWith("http://") ||
    specifier.startsWith("https://") ||
    specifier.startsWith("data:") ||
    specifier.startsWith("#")
  )
}

/** Assert every source import couples only through a declared dependency or an in-app relative path. */
function assertImportsStayLocal(appDir: string, declared: Set<string>): void {
  for (const file of moduleFiles(appDir)) {
    const source = readFileSync(file, "utf8")
    for (const specifier of importSpecifiers(source)) {
      if (specifier.startsWith(".")) {
        const resolved = resolve(file, "..", specifier)
        const outside = relative(appDir, resolved).startsWith("..")
        if (outside) {
          throw new EjectCouplingError(
            `${relative(appDir, file)} imports "${specifier}", which resolves outside the app — a standalone project cannot reach it.`,
          )
        }
      } else if (!isBuiltin(specifier)) {
        const base = basePackage(specifier)
        if (!declared.has(base)) {
          throw new EjectCouplingError(
            `${relative(appDir, file)} imports "${specifier}" but "${base}" is not a declared dependency — the version rewrite would not pin it.`,
          )
        }
      }
    }
  }
}

/** Assert every CSS import couples only through a declared dependency or an in-app relative path. */
function assertCssImportsStayLocal(appDir: string, declared: Set<string>): void {
  for (const file of cssFiles(appDir)) {
    const source = readFileSync(file, "utf8")
    for (const specifier of cssSpecifiers(source)) {
      if (isRemoteOrInlineAsset(specifier)) continue
      if (specifier.startsWith(".")) {
        const resolved = resolve(file, "..", specifier)
        const outside = relative(appDir, resolved).startsWith("..")
        if (outside) {
          throw new EjectCouplingError(
            `${relative(appDir, file)} imports "${specifier}" in CSS, which resolves outside the app — a standalone project cannot reach it.`,
          )
        }
      } else if (!isBuiltin(specifier)) {
        const base = basePackage(specifier)
        if (!declared.has(base)) {
          throw new EjectCouplingError(
            `${relative(appDir, file)} imports "${specifier}" in CSS but "${base}" is not a declared dependency — the version rewrite would not pin it.`,
          )
        }
      }
    }
  }
}

/** Assert the app `tsconfig` couples only through the base config eject inlines standalone. */
function assertTsconfigNeutralized(appDir: string): void {
  const tsconfig = readJsonc<{
    extends?: unknown
    references?: unknown
    compilerOptions?: { paths?: Record<string, unknown> }
  }>(join(appDir, "tsconfig.json"))
  if (tsconfig.extends !== NEUTRALIZED_TSCONFIG_EXTENDS) {
    throw new EjectCouplingError(
      `tsconfig.json extends ${JSON.stringify(tsconfig.extends)}; eject only neutralizes "${NEUTRALIZED_TSCONFIG_EXTENDS}".`,
    )
  }
  if (tsconfig.references !== undefined) {
    throw new EjectCouplingError(
      "tsconfig.json declares project references, which point outside a standalone project.",
    )
  }
  const paths = tsconfig.compilerOptions?.paths
  if (paths !== undefined && Object.keys(paths).length > 0) {
    throw new EjectCouplingError(
      "tsconfig.json declares compilerOptions.paths, which alias workspace source outside a standalone project.",
    )
  }
}

/**
 * Assert a source app is ejectable — it couples to the monorepo only through channels eject
 * neutralizes. Throws {@link EjectCouplingError} on the first un-neutralized coupling. Reused by
 * the bundle step (fail-closed at build) and the ejectability test.
 */
export function assertEjectable(options: AssertEjectableOptions): void {
  const manifest = readJson<PackageManifest>(join(options.appDir, "package.json"))
  const published = publishedPlainworksPackages(options.repoRoot)
  const declared = new Set(
    DEPENDENCY_SECTIONS.flatMap((section) => Object.keys(manifest[section] ?? {})),
  )
  assertPublishedDependencies(manifest, published)
  assertImportsStayLocal(options.appDir, declared)
  assertCssImportsStayLocal(options.appDir, declared)
  assertTsconfigNeutralized(options.appDir)
}
