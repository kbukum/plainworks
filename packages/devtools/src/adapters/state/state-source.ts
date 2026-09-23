import type { Store } from "@plainworks/state"
import { isRecord } from "@plainworks/std"
import { createEventSampler } from "../../retention"
import type { Source, SourceHandle } from "../../source"

/** Options for {@link createStateSource}. */
export interface StateSourceOptions<State = unknown> {
  /** The Plainworks store to observe (`@plainworks/state`'s public `Store` seam). */
  readonly store: Store<State>
  /**
   * Stable identity for this store instance. Required whenever an app composes more than one
   * store — the adapter never guesses identity from runtime state.
   */
  readonly instance: string
  /** Display label; defaults to `State <instance>`. */
  readonly label?: string
  /**
   * Whitelist projection applied to the state before anything crosses the protocol. **Required**
   * so the adapter is private by default: only the fields it returns are ever summarized, loaded
   * as detail, or forwarded. Use it to drop sensitive or non-serializable subtrees at the
   * boundary; the session's defense-in-depth sanitize still runs afterwards. Return the whole
   * state (`(state) => state`) only when every field is safe to inspect.
   */
  readonly snapshot: (state: State) => unknown
  /** Clock for event and indicator timestamps. Defaults to `Date.now`. */
  readonly now?: () => number
  /**
   * Coalescing interval for rapid updates in milliseconds; `0` emits everything. Defaults to
   * 250 — a burst of writes collapses into one change event per interval.
   */
  readonly intervalMs?: number
}

const DEFAULT_INTERVAL_MS = 250
const MAX_CHANGED_KEYS = 20

/**
 * Observe a Plainworks store as a devtools source: bounded change summaries (which top-level keys
 * changed, never the values), a change-count indicator, and the full projected snapshot loaded on
 * demand only. Observation is **read-only** — the source advertises no commands, and functions,
 * cycles, and oversized values reach the panel only as safe markers after session sanitize.
 */
export function createStateSource<State>(options: StateSourceOptions<State>): Source {
  const now = options.now ?? Date.now
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS
  const project = options.snapshot
  return {
    id: { kind: "state", instance: options.instance },
    label: options.label ?? `State ${options.instance}`,
    connect(observer, _signal) {
      const sampler = createEventSampler({
        intervalMs,
        mode: "coalesce",
        onEmit: (event) => observer.emit(event),
        onError: (error) => observer.fail(error),
        now,
      })
      let changes = 0

      const unsubscribe = options.store.subscribe((state, previous) => {
        changes += 1
        let summary: { changed: readonly string[] } | undefined
        try {
          const projectedCurrent = project(state)
          const projectedPrevious = project(previous)
          summary = { changed: changedKeys(projectedCurrent, projectedPrevious) }
          observer.recover()
        } catch (error) {
          observer.fail(error)
        }
        sampler.offer({
          kind: "state.change",
          label: `${options.instance} changed`,
          severity: summary === undefined ? "warn" : "info",
          at: now(),
          ...(summary ? { summary } : {}),
          detail: "current",
        })
        observer.indicate({
          id: "state",
          label: options.label ?? `State ${options.instance}`,
          value: `${changes} change${changes === 1 ? "" : "s"}`,
          severity: "ok",
          updatedAt: now(),
          target: "state",
        })
      })

      const handle: SourceHandle = {
        async resolveDetail() {
          try {
            const detail = project(options.store.getState())
            observer.recover()
            return detail
          } catch (error) {
            observer.fail(error)
            throw error
          }
        },
        dispose() {
          sampler.flush()
          sampler.dispose()
          unsubscribe()
        },
      }
      return handle
    },
  }
}

/** The top-level keys whose values changed between two states, capped for the timeline row. */
function changedKeys(state: unknown, previous: unknown): readonly string[] {
  if (!isRecord(state) || !isRecord(previous)) return ["(root)"]
  const keys = new Set([...Object.keys(state), ...Object.keys(previous)])
  const changed = [...keys].filter((key) => state[key] !== previous[key]).sort()
  if (changed.length <= MAX_CHANGED_KEYS) return changed
  return [...changed.slice(0, MAX_CHANGED_KEYS), `+${changed.length - MAX_CHANGED_KEYS} more`]
}
