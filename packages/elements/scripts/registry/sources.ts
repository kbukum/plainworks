import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"

// Atoms come from two folders with different rules:
//
// src/shadcn/ shadcn CLI output after the compat transform. Only `registry:add`/`update` write it,
// and `shadcn.lock.json` fails CI on any hand edit. src/atoms/ primitives plainworks writes itself,
// held to the full engineering baseline.
//
// Both publish as flat `@plainworks/elements/<name>` subpaths, so a name must be unique across
// them.
export const SHADCN_DIR = "src/shadcn"
export const OWNED_DIR = "src/atoms"

/** Which folder an atom was authored in: vendored shadcn output or an owned primitive. */
export type AtomOrigin = "shadcn" | "owned"

/** A published atom: its subpath name, origin folder, and repo-relative source path. */
export interface AtomSource {
  name: string
  origin: AtomOrigin
  path: string
}

const ORIGINS: readonly { origin: AtomOrigin; dir: string }[] = [
  { origin: "shadcn", dir: SHADCN_DIR },
  { origin: "owned", dir: OWNED_DIR },
]

function atomFiles(root: string, dir: string): string[] {
  if (!existsSync(join(root, dir))) return []
  return readdirSync(join(root, dir)).filter(
    (entry) => entry.endsWith(".tsx") && !entry.endsWith(".test.tsx"),
  )
}

/** Every published atom with its origin folder, sorted by name. Throws on a cross-folder clash. */
export function atomSources(root: string): AtomSource[] {
  const byName = new Map<string, AtomSource>()
  for (const { origin, dir } of ORIGINS) {
    for (const entry of atomFiles(root, dir)) {
      const name = entry.slice(0, -".tsx".length)
      if (byName.has(name)) {
        throw new Error(`atom "${name}" exists in both ${SHADCN_DIR} and ${OWNED_DIR}.`)
      }
      byName.set(name, { name, origin, path: `${dir}/${entry}` })
    }
  }
  return [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : 1))
}

/** The repo-relative path an upstream shadcn atom is written to. */
export function shadcnPath(name: string): string {
  return `${SHADCN_DIR}/${name}.tsx`
}
