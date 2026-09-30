import { readdirSync } from "node:fs"
import { join } from "node:path"

// Generated and dependency trees never hold authored render tests, so the walk prunes them before
// descending. `fixtures` holds deliberate gate inputs, not real tests.
const EXCLUDED_DIRS = new Set([
  "node_modules",
  "dist",
  ".next",
  ".bundle-analysis",
  ".turbo",
  "coverage",
  "fixtures",
])

/** Recursively collect the `*.test.tsx` files under `root`, skipping generated trees. */
export function collectRenderTests(root: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectRenderTests(path))
    } else if (entry.isFile() && entry.name.endsWith(".test.tsx")) {
      files.push(path)
    }
  }
  return files
}
