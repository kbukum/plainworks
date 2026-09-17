import { readdirSync } from "node:fs"
import { join } from "node:path"

// The one source-file collector both entrypoints share — the `--check`/`--write` CLI and the safety
// `verify`. Sharing it means the generated-output exclusions (`dist`, `.next`, `.turbo`, coverage,
// generated fixtures) are defined once, so neither tool can drift into reflowing generated code.
const EXCLUDED_DIRS = new Set([
  "node_modules",
  "dist",
  ".next",
  ".turbo",
  "coverage",
  "gen",
  "fixtures",
])

/**
 * Recursively collect the `.ts`/`.tsx` files under `root`. An excluded directory is rejected before
 * descending into it, so a large generated tree (a `.next` build) is never enumerated at all.
 */
export function collectFiles(root: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectFiles(path))
      continue
    }
    if (entry.isFile() && (path.endsWith(".ts") || path.endsWith(".tsx"))) files.push(path)
  }
  return files
}
