import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join, relative } from "node:path"
import { DEFAULT_HOST, HOST_REGISTRY, type HostDefinition, type HostId } from "../host"
import type { PackageManifest } from "../scaffold/manifest"
import { isSkippedEntry } from "./config"
import { assertEjectable } from "./coupling"
import { DEFAULT_TEMPLATE_NAME, toTemplateManifest } from "./manifest"

// The build-time eject: turn a real, gated source app into the self-contained example payload the
// published initializer ships and scaffolds from. It runs the ejectability gate first (fail-closed
// on any un-neutralized coupling), copies the app source minus build output and the test suite,
// then replaces the workspace-only couplings with standalone equivalents — the base-extending
// `tsconfig` becomes an inline one, the app manifest becomes the lean starter template, and
// `.gitignore` is renamed to `_gitignore` so npm keeps it in the tarball (the scaffold step
// restores it). The only coupling left is the `workspace:`/`catalog:` dependency ranges, which the
// runtime rewrite pins.

/** Inputs for {@link bundleExample}. */
export interface BundleExampleOptions {
  /** Absolute path of the source app (an `apps/*` member). */
  readonly appDir: string
  /** Absolute path the ejected example is written to (created fresh). */
  readonly destDir: string
  /** Absolute path of the monorepo root, for the ejectability gate. */
  readonly repoRoot: string
  /** Host template identifier. Derived from {@link HOST_REGISTRY}. Defaults to "next". */
  readonly host?: HostId
}

/** Read and parse a JSON file. */
function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T
}

/** Copy the app source into `destDir`, skipping build output and the test suite by relative path. */
function copyAppSource(appDir: string, destDir: string): void {
  cpSync(appDir, destDir, {
    recursive: true,
    filter: (source) => source === appDir || !isSkippedEntry(relative(appDir, source)),
  })
}

/**
 * Eject `appDir` into `destDir` as a standalone example. Asserts the app is ejectable, copies its
 * source, then writes the standalone `tsconfig.json`, the lean starter `package.json`, and the
 * `_gitignore` marker in place of the workspace-only originals.
 */
export function bundleExample(options: BundleExampleOptions): void {
  assertEjectable({ appDir: options.appDir, repoRoot: options.repoRoot })

  const hostId = options.host ?? DEFAULT_HOST
  const hostDef: HostDefinition = HOST_REGISTRY[hostId]

  rmSync(options.destDir, { recursive: true, force: true })
  mkdirSync(options.destDir, { recursive: true })
  copyAppSource(options.appDir, options.destDir)

  // The base-extending workspace tsconfig is replaced with the host's inline standalone config.
  writeFileSync(
    join(options.destDir, "tsconfig.json"),
    `${JSON.stringify(hostDef.tsconfig, null, 2)}\n`,
  )

  // The gated app manifest becomes the lean starter template (test wiring dropped, ranges kept for
  // the runtime version rewrite to pin).
  const appManifest = readJson<PackageManifest>(join(options.appDir, "package.json"))
  writeFileSync(
    join(options.destDir, "package.json"),
    `${JSON.stringify(toTemplateManifest(appManifest, hostDef.templateDescription), null, 2)}\n`,
  )

  // Emit a clean standalone starter README instead of copying the monorepo workspace README.
  if (hostDef.renderReadme) {
    writeFileSync(join(options.destDir, "README.md"), hostDef.renderReadme(DEFAULT_TEMPLATE_NAME))
  }

  // npm drops a real `.gitignore` from a published tarball, so ship it as `_gitignore`; the
  // scaffold step restores the dot on copy.
  renameGitignore(options.destDir)
}

/** Rename a copied `.gitignore` to the `_gitignore` marker npm preserves in a tarball. */
function renameGitignore(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === ".gitignore") {
      renameSync(join(dir, ".gitignore"), join(dir, "_gitignore"))
    }
  }
}
