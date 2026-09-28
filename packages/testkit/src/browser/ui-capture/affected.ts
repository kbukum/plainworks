import type { Flow } from "../flow/definition"
import type { SelectedFlow } from "../flow/report/schema"
import { compileGlob } from "./glob"

/** Options for {@link selectAffectedFlows}. */
export interface AffectedFlowsOptions {
  readonly flows: readonly Flow[]
  /** Repository-relative paths changed since the base. */
  readonly changed: readonly string[]
  /** Globs of files that cannot change what a page shows, such as docs and unit tests. */
  readonly ignore?: readonly string[]
}

/** The flows a change affects, and the changed files no flow covers. */
export interface AffectedFlows {
  readonly flows: readonly SelectedFlow[]
  readonly unmapped: readonly string[]
}

// How many files one reason names before it counts the rest.
const LISTED_FILES = 3

/**
 * Pick the flows a change affects: each flow whose `covers` globs match a changed file. A changed
 * file no flow covers, and no `ignore` glob excludes, **fails safe** to every flow, so a change the
 * flows do not map is never left unchecked. Each flow says why it was picked. Flows keep their
 * suite order.
 */
export function selectAffectedFlows(options: AffectedFlowsOptions): AffectedFlows {
  const ignored = (options.ignore ?? []).map(compileGlob)
  const relevant = options.changed.filter((file) => !ignored.some((glob) => glob.test(file)))
  const covering = options.flows.map((flow) => {
    const globs = (flow.covers ?? []).map(compileGlob)
    return { flow, files: relevant.filter((file) => globs.some((glob) => glob.test(file))) }
  })
  const covered = new Set(covering.flatMap(({ files }) => files))
  const unmapped = relevant.filter((file) => !covered.has(file))
  const failSafe = unmapped.length === 0 ? [] : [`fail safe: no flow covers ${listed(unmapped)}`]
  const flows = covering.flatMap(({ flow, files }) => {
    if (files.length === 0 && unmapped.length === 0) return []
    const reasons = files.slice(0, LISTED_FILES).map((file) => `covers ${file}`)
    if (files.length > LISTED_FILES) {
      reasons.push(`covers ${files.length - LISTED_FILES} more changed files`)
    }
    return [{ name: flow.name, reasons: [...reasons, ...failSafe] }]
  })
  return { flows, unmapped }
}

function listed(files: readonly string[]): string {
  const named = files.slice(0, LISTED_FILES).join(", ")
  return files.length > LISTED_FILES ? `${named} and ${files.length - LISTED_FILES} more` : named
}
