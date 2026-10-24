import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

// The Biome binary hoisted to the monorepo root. Calling it directly (rather than `bunx`) keeps
// codegen offline: the workspace already has Biome installed, so no package is ever fetched.
const BIOME_BIN = fileURLToPath(new URL("../../../node_modules/.bin/biome", import.meta.url))

function biome(args: readonly string[], source: string, action: string, path: string): string {
  try {
    return execFileSync(BIOME_BIN, [...args, `--stdin-file-path=${path}`], {
      input: source,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30_000,
    })
  } catch (error) {
    // execFileSync's own message is a generic "Command failed"; Biome's stderr stays on the cause.
    throw new Error(`Biome failed to ${action} ${path}`, { cause: error })
  }
}

/**
 * Format a source string with the repo Biome config, using `filename`'s language (`.ts`, `.tsx`,
 * `.json`). The result is deterministic, so generated files are format-clean by construction.
 */
export function formatSource(source: string, filename: string): string {
  return biome(["format"], source, "format", filename)
}

/**
 * Format a source string and apply Biome's safe fixes (organized imports, `import type`); unsafe
 * fixes never run. `path` is where the file will live, so `biome.json` folder overrides apply as
 * they do in the lint gate.
 */
export function fixSource(source: string, path: string): string {
  return biome(["check", "--write"], source, "fix", path)
}
