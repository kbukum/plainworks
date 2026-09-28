/** How much run output to keep. Named snapshots live elsewhere and are never pruned. */
export interface RetentionPolicy {
  /** The most runs to keep, the current one included. */
  readonly keepRuns: number
  /**
   * The most bytes the kept runs may use together: a finite, non-negative number. The current run
   * is kept even above it.
   */
  readonly maxBytes: number
}

/** The default policy: the last five runs, within 1 GiB. */
export const DEFAULT_RETENTION: RetentionPolicy = { keepRuns: 5, maxBytes: 1024 * 1024 * 1024 }

/** A stored run and its size on disk. */
export interface StoredRun {
  readonly id: string
  readonly bytes: number
}

/**
 * Decide which runs to remove, oldest first. Run ids sort in time order, so the newest
 * `keepRuns` survive; then the oldest survivors go until the rest fit `maxBytes`. The `current`
 * run always survives and takes one of the `keepRuns` slots, even when newer runs finished first.
 * Throws {@link RangeError} for a policy that keeps no run or has no valid byte cap.
 */
export function planRunRetention(
  runs: readonly StoredRun[],
  policy: RetentionPolicy,
  current: string,
): string[] {
  if (!Number.isInteger(policy.keepRuns) || policy.keepRuns < 1) {
    throw new RangeError("A retention policy must keep at least one run")
  }
  if (!Number.isFinite(policy.maxBytes) || policy.maxBytes < 0) {
    throw new RangeError("A retention policy needs a finite, non-negative byte cap")
  }
  const newestFirst = [...runs].sort(newerFirst)
  const others = newestFirst.filter((run) => run.id !== current)
  const slots = policy.keepRuns - (others.length < newestFirst.length ? 1 : 0)
  const removed = others.slice(slots)
  const kept = newestFirst.filter((run) => !removed.includes(run))
  let bytes = kept.reduce((total, run) => total + run.bytes, 0)
  for (const run of [...kept].reverse()) {
    if (bytes <= policy.maxBytes) break
    if (run.id === current) continue
    bytes -= run.bytes
    removed.push(run)
  }
  return removed.map((run) => run.id).sort()
}

const newerFirst = (a: StoredRun, b: StoredRun): number => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
