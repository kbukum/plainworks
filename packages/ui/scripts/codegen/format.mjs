import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

// The Biome binary hoisted to the monorepo root. Formatting through it (rather than `bunx`) keeps
// codegen offline: the workspace already has Biome installed, so no package is ever fetched.
const BIOME_BIN = fileURLToPath(new URL("../../../../node_modules/.bin/biome", import.meta.url))

/**
 * Format a source string with the repo Biome config, honouring `filename`'s language (`.ts`,
 * `.json`). Deterministic — same input, same output — so every generated file is format-clean by
 * construction and the lint gate stays green without a hand-edit. Injected as a seam so unit tests
 * stay offline.
 */
export function formatSource(source, filename) {
  try {
    return execFileSync(BIOME_BIN, ["format", `--stdin-file-path=${filename}`], {
      input: source,
      encoding: "utf8",
    })
  } catch (error) {
    // Preserve Biome's underlying failure (its captured stderr lives on the cause) instead of
    // surfacing execFileSync's generic "Command failed" with no context.
    throw new Error(`Biome failed to format ${filename}`, { cause: error })
  }
}
