import { createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { formatSource } from "./format"
import { isRecord, readJson } from "./json"
import { atomSources, shadcnPath } from "./sources"

// `shadcn.lock.json` pins every file under `src/shadcn/` to the exact bytes `registry:add`/`update`
// wrote, plus the shadcn CLI version and style that produced them:
//
//   { "shadcn": { "cli": "4.21.0", "style": "base-nova" },
//     "atoms":  { "button": "sha256-…", … } }
//
// `verifyLock` runs offline in the test gate, so a hand edit to a shadcn atom fails CI. Deviations
// belong in the theme, at call sites, or in a `@plainworks/ui` wrapper.
export const LOCK_FILE = "shadcn.lock.json"

/** The shadcn CLI version and style a locked atom was produced with. */
export interface Upstream {
  cli: string
  style: string
}

function hashSource(source: string): string {
  return `sha256-${createHash("sha256").update(source).digest("hex")}`
}

/** The `name → hash` map from the lock on disk, or an empty map when no lock exists yet. */
function readLockedAtoms(root: string): Record<string, string> {
  const path = join(root, LOCK_FILE)
  if (!existsSync(path)) return {}
  const parsed = readJson(path)
  const atoms = isRecord(parsed) && isRecord(parsed.atoms) ? parsed.atoms : {}
  const locked: Record<string, string> = {}
  for (const [name, hash] of Object.entries(atoms)) {
    if (typeof hash === "string") locked[name] = hash
  }
  return locked
}

/** Record `source` as the locked content of shadcn atom `name`, produced by `upstream`. */
export function lockAtom(root: string, name: string, source: string, upstream: Upstream): void {
  const atoms = { ...readLockedAtoms(root), [name]: hashSource(source) }
  const sorted = Object.fromEntries(Object.entries(atoms).sort(([a], [b]) => (a < b ? -1 : 1)))
  const next = { shadcn: upstream, atoms: sorted }
  writeFileSync(
    join(root, LOCK_FILE),
    formatSource(`${JSON.stringify(next, null, 2)}\n`, LOCK_FILE),
  )
}

/** Human-readable lock failures for `root`; an empty list means every shadcn atom is untouched. */
export function verifyLock(root: string): string[] {
  const atoms = readLockedAtoms(root)
  const failures: string[] = []
  const onDisk = atomSources(root).filter((atom) => atom.origin === "shadcn")
  for (const { name, path } of onDisk) {
    const locked = atoms[name]
    if (locked === undefined) {
      failures.push(`${path} is not in ${LOCK_FILE}; add it with \`registry:add ${name}\`.`)
    } else if (locked !== hashSource(readFileSync(join(root, path), "utf8"))) {
      failures.push(`${path} was edited by hand; only \`registry:update ${name}\` may change it.`)
    }
  }
  const present = new Set(onDisk.map((atom) => atom.name))
  for (const name of Object.keys(atoms)) {
    if (!present.has(name)) {
      failures.push(`${LOCK_FILE} locks "${name}" but ${shadcnPath(name)} does not exist.`)
    }
  }
  return failures
}
