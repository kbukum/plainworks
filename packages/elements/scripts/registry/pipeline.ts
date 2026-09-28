import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fixTsx } from "./format"
import { isRecord, readJson } from "./json"
import { diffLines } from "./line-diff"
import { lockAtom, type Upstream, verifyLock } from "./lock"
import { packageRoot } from "./manifest"
import { shadcnPull, shadcnUpstream } from "./shadcn"
import { OWNED_DIR, shadcnPath } from "./sources"
import { applyCompatTransform } from "./transform"

// The offline atom pipeline: ingest, diff, and validate. The process-facing CLI (argv parsing,
// stdout, exit codes) lives in `cli.ts`; the logic here is what the pipeline tests measure.
//
// Every shadcn atom is materialized the same way — pull → compat transform → Biome safe fixes —
// so `add`, `update`, and `diff` reproduce it byte for byte, and `shadcn.lock.json` can pin it.

/** The injectable pipeline seams: upstream pull, Biome fix, and the installed CLI version. */
export interface Seams {
  pull: (name: string, root: string) => string
  fix: (source: string, path: string) => string
  upstream: (root: string) => Upstream
}

/** The result of re-materializing an atom and comparing it with the file on disk. */
export interface AtomDiff {
  changed: boolean
  fresh: string
  current: string
}

/**
 * The default seams: the shadcn CLI, Biome, and the installed CLI version. Tests inject offline
 * fakes for all three.
 */
const DEFAULT_SEAMS: Seams = { pull: shadcnPull, fix: fixTsx, upstream: shadcnUpstream }

function materializeAtom(root: string, name: string, seams: Seams): string {
  return seams.fix(applyCompatTransform(seams.pull(name, root)), join(root, shadcnPath(name)))
}

/**
 * Ingest one shadcn atom: pull it from upstream, materialize it, write it under `src/shadcn/`, and
 * lock its hash. Refuses a name an owned atom already uses, since both publish the same subpath.
 */
export function ingestAtom(root: string, name: string, seams: Seams = DEFAULT_SEAMS): string {
  if (existsSync(join(root, OWNED_DIR, `${name}.tsx`))) {
    throw new Error(`"${name}" is an owned atom in ${OWNED_DIR}; remove it before adding shadcn's.`)
  }
  const atom = materializeAtom(root, name, seams)
  writeFileSync(join(root, shadcnPath(name)), atom)
  lockAtom(root, name, atom, seams.upstream(root))
  return atom
}

/**
 * Re-materialize an atom from current upstream and compare it with the file on disk, without
 * writing. Advisory only; `registry:update` adopts the change.
 */
export function diffAtom(root: string, name: string, seams: Seams = DEFAULT_SEAMS): AtomDiff {
  const fresh = materializeAtom(root, name, seams)
  const path = join(root, shadcnPath(name))
  const current = existsSync(path) ? readFileSync(path, "utf8") : ""
  return { changed: fresh !== current, fresh, current }
}

/** The `registry:diff` report: a unified diff per atom that moved upstream. Never writes. */
export function diffReport(
  root: string,
  names: readonly string[],
  seams: Seams = DEFAULT_SEAMS,
): string {
  const lines: string[] = []
  let anyChange = false
  for (const name of names) {
    const { changed, fresh, current } = diffAtom(root, name, seams)
    if (!changed) {
      lines.push(`${name}: up to date with upstream.`)
      continue
    }
    anyChange = true
    lines.push(`--- ${name} (locked)`, `+++ ${name} (upstream)`, diffLines(current, fresh))
  }
  if (anyChange) {
    lines.push("Run `registry:update <atom>` to adopt the upstream change.")
  }
  return `${lines.join("\n")}\n`
}

/**
 * Offline check that registry.json is schema-shaped with every declared file on disk, and that no
 * shadcn atom drifted from `shadcn.lock.json`. An empty list means the registry is valid.
 */
export function validateRegistry(root: string = packageRoot): string[] {
  const failures: string[] = []
  let registry: unknown
  try {
    registry = readJson(join(root, "registry.json"))
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return [`registry.json is not readable JSON: ${detail}`]
  }
  if (!isRecord(registry)) return ["registry.json is not a JSON object."]
  if (typeof registry.name !== "string" || registry.name.length === 0) {
    failures.push("registry.json is missing a `name`.")
  }
  if (!Array.isArray(registry.items)) {
    return [...failures, "registry.json is missing an `items` array."]
  }
  for (const item of registry.items) {
    if (!isRecord(item) || typeof item.name !== "string" || item.name.length === 0) {
      failures.push("an item is missing a `name`.")
      continue
    }
    if (!Array.isArray(item.files) || item.files.length === 0) {
      failures.push(`${item.name}: no files declared.`)
      continue
    }
    for (const file of item.files) {
      const declared = isRecord(file) ? file.path : undefined
      if (typeof declared !== "string" || !existsSync(join(root, declared))) {
        failures.push(`${item.name}: declared file is missing: ${String(declared)}`)
      }
    }
  }
  return [...failures, ...verifyLock(root)]
}
