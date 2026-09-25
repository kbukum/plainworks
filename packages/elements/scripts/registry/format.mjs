import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

// The Biome binary hoisted to the monorepo root. Formatting through it (rather than `bunx`) keeps
// the pipeline offline: the workspace already has Biome installed, so no package is ever fetched.
const BIOME_BIN = fileURLToPath(new URL("../../../../node_modules/.bin/biome", import.meta.url))

/**
 * Format a source string with the repo Biome config, honouring `filename`'s language (`.tsx`,
 * `.ts`, `.json`). Deterministic — same input, same output — so a freshly ingested atom and every
 * generated file are format-clean by construction and the lint gate stays green without a hand-edit.
 * The pipeline injects this as a seam so unit tests stay offline.
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

/**
 * Format one shadcn atom and apply Biome's safe fixes (organized imports, `import type`), so an
 * ingested atom lands lint-clean without a hand edit. Unsafe fixes are never applied; any rule
 * upstream still trips is switched off for `src/shadcn/` in `biome.json`. `path` is where the atom
 * will be written, so folder overrides in `biome.json` apply exactly as they do in the lint gate.
 */
export function fixTsx(source, path) {
  try {
    return execFileSync(BIOME_BIN, ["check", "--write", `--stdin-file-path=${path}`], {
      input: source,
      encoding: "utf8",
    })
  } catch (error) {
    throw new Error(`Biome failed to fix ${path}`, { cause: error })
  }
}
