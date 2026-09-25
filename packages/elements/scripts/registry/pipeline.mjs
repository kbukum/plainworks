import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fixTsx } from "./format.mjs"
import { diffLines } from "./line-diff.mjs"
import { lockAtom, verifyLock } from "./lock.mjs"
import { packageRoot } from "./manifest.mjs"
import { shadcnPull, shadcnUpstream } from "./shadcn.mjs"
import { OWNED_DIR, shadcnPath } from "./sources.mjs"
import { applyCompatTransform } from "./transform.mjs"

// The offline atom pipeline: ingest, diff, and validate. The process-facing CLI (argv parsing,
// stdout, exit codes) lives in `cli.mjs`; the logic here is what the pipeline tests measure.
//
// Every shadcn atom is materialized the same way — pull → compat transform → Biome safe fixes —
// so `add`, `update`, and `diff` reproduce it byte for byte, and `shadcn.lock.json` can pin it.

/**
 * The default seams: the shadcn CLI, Biome, and the installed CLI version. Tests inject offline
 * fakes for all three.
 */
const DEFAULT_SEAMS = { pull: shadcnPull, fix: fixTsx, upstream: shadcnUpstream }

function materializeAtom(root, name, seams) {
  return seams.fix(applyCompatTransform(seams.pull(name, root)), join(root, shadcnPath(name)))
}

/**
 * Ingest one shadcn atom: pull it from upstream, materialize it, write it under `src/shadcn/`, and
 * lock its hash. Refuses a name an owned atom already uses, since both publish the same subpath.
 */
export function ingestAtom(root, name, seams = DEFAULT_SEAMS) {
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
export function diffAtom(root, name, seams = DEFAULT_SEAMS) {
  const fresh = materializeAtom(root, name, seams)
  const path = join(root, shadcnPath(name))
  const current = existsSync(path) ? readFileSync(path, "utf8") : ""
  return { changed: fresh !== current, fresh, current }
}

/** The `registry:diff` report: a unified diff per atom that moved upstream. Never writes. */
export function diffReport(root, names, seams = DEFAULT_SEAMS) {
  const lines = []
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
export function validateRegistry(root = packageRoot) {
  const failures = []
  let registry
  try {
    registry = JSON.parse(readFileSync(join(root, "registry.json"), "utf8"))
  } catch (error) {
    return [`registry.json is not readable JSON: ${error.message}`]
  }
  if (typeof registry.name !== "string" || registry.name.length === 0) {
    failures.push("registry.json is missing a `name`.")
  }
  if (!Array.isArray(registry.items)) {
    return [...failures, "registry.json is missing an `items` array."]
  }
  for (const item of registry.items) {
    if (typeof item.name !== "string" || item.name.length === 0) {
      failures.push("an item is missing a `name`.")
      continue
    }
    if (!Array.isArray(item.files) || item.files.length === 0) {
      failures.push(`${item.name}: no files declared.`)
      continue
    }
    for (const file of item.files) {
      if (typeof file.path !== "string" || !existsSync(join(root, file.path))) {
        failures.push(`${item.name}: declared file is missing: ${file.path}`)
      }
    }
  }
  return [...failures, ...verifyLock(root)]
}
