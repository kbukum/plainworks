import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { packageRoot } from "./manifest.mjs"
import { SHADCN_DIR, shadcnPath } from "./sources.mjs"

// The shadcn CLI is a catalog-pinned dev dependency of this package: resolve the *installed* entry
// and execute it with the current runtime, so the lockfile — not a `bunx shadcn@latest` download —
// controls exactly which reviewed release runs in the maintainer environment.
function shadcnEntry() {
  try {
    return createRequire(import.meta.url).resolve("shadcn")
  } catch (cause) {
    throw new Error(
      "the shadcn CLI is not installed; run `bun install` so the catalog-pinned version is used.",
      { cause },
    )
  }
}

// Pull one atom straight from upstream through the official shadcn CLI. The atoms come from the
// tool, never a source checkout: `shadcn add` runs against a throwaway staging project whose
// components.json mirrors this package (same base-nova preset + `@/` alias), then the emitted file
// is returned for the compat transform. Network-bound and maintainer-run — never part of an
// offline command.
export function shadcnPull(name, root = packageRoot) {
  const staging = mkdtempSync(join(tmpdir(), "pw-elements-stage-"))
  try {
    mkdirSync(join(staging, "src/lib"), { recursive: true })
    mkdirSync(join(staging, SHADCN_DIR), { recursive: true })
    cpSync(join(root, "components.json"), join(staging, "components.json"))
    writeFileSync(join(staging, "src/styles.css"), "")
    writeFileSync(join(staging, "src/lib/utils.ts"), "export function cn(...c: unknown[]) {\n  return c\n}\n")
    writeFileSync(join(staging, "package.json"), '{ "name": "pw-elements-stage", "type": "module" }\n')
    // The shadcn CLI resolves the `@/` alias through the project tsconfig, so the staging project
    // needs one that mirrors this package's alias, or the CLI aborts before emitting.
    writeFileSync(
      join(staging, "tsconfig.json"),
      `${JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } } }, null, 2)}\n`,
    )
    const result = spawnSync(
      process.execPath,
      [shadcnEntry(), "add", name, "--overwrite", "--cwd", staging],
      { stdio: "inherit" },
    )
    if (result.error) {
      throw new Error(`shadcn add ${name} could not be spawned`, { cause: result.error })
    }
    if (result.status !== 0) {
      throw new Error(`shadcn add ${name} failed with exit code ${result.status}`)
    }
    return readFileSync(join(staging, shadcnPath(name)), "utf8")
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

/** The CLI version and style that `shadcnPull` runs with, recorded in the lock. */
export function shadcnUpstream(root = packageRoot) {
  const entry = shadcnEntry()
  const pkg = JSON.parse(readFileSync(join(entry, "../../package.json"), "utf8"))
  const { style } = JSON.parse(readFileSync(join(root, "components.json"), "utf8"))
  return { cli: pkg.version, style }
}
