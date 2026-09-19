import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { copyTemplate } from "./copy"
import { type PackageManifest, rewriteManifest, type VersionResolvers } from "./manifest"

// Orchestrate the deterministic, filesystem half of a scaffold: refuse a non-empty target, copy the
// selected template, then rewrite the copied `package.json` to a standalone, version-pinned one.
// This is the unit the CI smoke and the fs tests drive; the process-spawning install/git tail lives
// in `finalize.ts`, and the interactive/argv shell in the `bin`.

/** Inputs for {@link generateProject}. */
export interface GenerateProjectOptions extends VersionResolvers {
  /** The chosen project name, written into the generated manifest. */
  readonly projectName: string
  /** Absolute directory to generate into; must be empty or absent. */
  readonly targetDir: string
  /** Absolute path of the template directory to copy. */
  readonly templateDir: string
}

/** Raised when the target directory already contains files. */
export class TargetDirectoryError extends Error {
  constructor(readonly targetDir: string) {
    super(`Target directory "${targetDir}" is not empty. Choose a new name or clear it first.`)
    this.name = "TargetDirectoryError"
  }
}

/** Create the target directory, or verify an existing one is empty. */
function ensureEmptyDir(dir: string): void {
  try {
    const stats = statSync(dir)
    if (stats.isDirectory() && readdirSync(dir).length > 0) {
      throw new TargetDirectoryError(dir)
    }
  } catch (error) {
    if (error instanceof TargetDirectoryError) throw error
    // ENOENT: the directory does not exist yet, which is the common, valid case.
    mkdirSync(dir, { recursive: true })
    return
  }
  mkdirSync(dir, { recursive: true })
}

/**
 * Generate a project into `targetDir`: copy the template, then pin its manifest. The resulting
 * `package.json` carries the chosen name and concrete versions — no `catalog:`/`workspace:` — so it
 * installs standalone.
 */
export function generateProject(options: GenerateProjectOptions): void {
  ensureEmptyDir(options.targetDir)
  copyTemplate(options.templateDir, options.targetDir)

  const manifestPath = join(options.targetDir, "package.json")
  const template = JSON.parse(readFileSync(manifestPath, "utf8")) as PackageManifest
  const manifest = rewriteManifest(template, {
    projectName: options.projectName,
    plainworksVersions: options.plainworksVersions,
    catalogVersions: options.catalogVersions,
  })
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}
