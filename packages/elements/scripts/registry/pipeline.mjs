import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { applyAccessibilityFixes } from "./accessibility.mjs"
import { applyCompatTransform } from "./transform.mjs"
import { diffLines } from "./line-diff.mjs"
import { formatTsx } from "./format.mjs"
import { packageRoot } from "./manifest.mjs"
import { shadcnPull } from "./shadcn.mjs"

// The offline atom pipeline: ingest, diff, and validate. The process-facing CLI (argv parsing,
// stdout, exit codes) lives in `cli.mjs`; the logic here is what the pipeline tests measure.

const ATOM_DIR = "src/atoms"

function atomPath(root, name) {
  return join(root, ATOM_DIR, `${name}.tsx`)
}

/**
 * Materialize the owned atom from upstream: pull it, apply the compat transform (cn import +
 * `"use client"`), format it to the repo style, then apply any declared accessibility corrections
 * against that formatted source. `add`, `update`, and `diff` all funnel through here, so an atom is
 * reproduced identically — corrections included — and never drifts against a hand edit.
 */
function materializeAtom(root, name, pull, format) {
  return applyAccessibilityFixes(format(applyCompatTransform(pull(name, root))), name)
}

/**
 * Ingest one atom: pull it from upstream, run the full materialize pipeline, and write the owned
 * file. The `pull` seam defaults to the shadcn CLI and `format` to Biome; tests inject fakes to
 * prove the pipeline offline. Codegen re-runs afterward so registry.json / exports / entries track
 * the new file.
 */
export function ingestAtom(root, name, pull = shadcnPull, format = formatTsx) {
  const owned = materializeAtom(root, name, pull, format)
  writeFileSync(atomPath(root, name), owned)
  return owned
}

/**
 * Re-run the ingest pipeline against current upstream and return the delta versus the owned file,
 * without writing. Advisory only: our `"use client"` directive, `@plainworks/theme` cn import, and
 * declared accessibility corrections are expected, so a human reads past them — this is never a
 * gate. `fresh` is materialized the same way the owned file is, so a diff never surfaces pure
 * formatting or expected-correction noise.
 */
export function diffAtom(root, name, pull = shadcnPull, format = formatTsx) {
  const fresh = materializeAtom(root, name, pull, format)
  const owned = existsSync(atomPath(root, name)) ? readFileSync(atomPath(root, name), "utf8") : ""
  return { changed: fresh !== owned, fresh, owned }
}

/**
 * Build the full `registry:diff` stdout report for `names` without writing anything: a unified
 * diff per changed atom (owned vs upstream + compat), so a maintainer reviews the real delta
 * instead of re-running the mutating update. The `pull`/`format` seams keep the tests offline.
 */
export function diffReport(root, names, pull = shadcnPull, format = formatTsx) {
  const lines = []
  let anyChange = false
  for (const name of names) {
    const { changed, fresh, owned } = diffAtom(root, name, pull, format)
    if (!changed) {
      lines.push(`${name}: up to date with upstream (compat delta aside).`)
      continue
    }
    anyChange = true
    lines.push(`--- ${name} (owned)`, `+++ ${name} (upstream + compat)`, diffLines(owned, fresh))
  }
  if (anyChange) {
    lines.push("Run `registry:update <atom>` to adopt the upstream change.")
  }
  return lines.join("\n") + "\n"
}

/**
 * Offline correctness check for registry.json: it must be schema-shaped (a named registry of
 * `registry:ui` items) and every declared file must exist on disk. Returns human-readable failures;
 * an empty list means the registry is valid.
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
  return failures
}
