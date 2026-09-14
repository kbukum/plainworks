import { useCallback, useMemo } from "react"
import { useControllableState } from "./use-controllable-state"

/** Whether a selection holds at most one key (`single`) or any number (`multiple`). */
export type SelectionMode = "single" | "multiple"

/** Options for {@link useSelection}. */
export interface UseSelectionOptions<K> {
  /**
   * `single` replaces the selection on each pick; `multiple` accumulates. Defaults to `multiple`.
   */
  readonly mode?: SelectionMode | undefined
  /** Controlled selection; when defined the hook never owns the set. */
  readonly value?: ReadonlySet<K> | undefined
  /** Initial selection while uncontrolled. Defaults to empty. */
  readonly defaultValue?: ReadonlySet<K> | undefined
  /** Called with the requested next selection. */
  readonly onChange?: ((selected: ReadonlySet<K>) => void) | undefined
}

/** A keyed selection over list/table items. */
export interface Selection<K> {
  readonly selected: ReadonlySet<K>
  readonly isSelected: (key: K) => boolean
  readonly toggle: (key: K) => void
  readonly select: (key: K) => void
  readonly deselect: (key: K) => void
  readonly clear: () => void
  readonly setSelected: (next: ReadonlySet<K>) => void
}

const EMPTY: ReadonlySet<never> = new Set()

/**
 * Controlled/uncontrolled keyed selection for lists and tables. In `single` mode a
 * `toggle`/`select` replaces the set with just that key (toggling the current key clears it); in
 * `multiple` mode keys accumulate. Every mutation produces a new `Set`, so a memoized consumer
 * re-renders correctly.
 *
 * `mode` governs only `select`/`toggle`. A controlled `value`, the `defaultValue`, and the escape-
 * hatch `setSelected` are passed through unchanged and may hold any number of keys — the caller
 * owns those, so `single` is not a hard cap on the set size.
 */
export function useSelection<K>(options: UseSelectionOptions<K> = {}): Selection<K> {
  const mode = options.mode ?? "multiple"
  const [selected, setSelected] = useControllableState<ReadonlySet<K>>({
    value: options.value,
    defaultValue: options.defaultValue ?? (EMPTY as ReadonlySet<K>),
    onChange: options.onChange,
  })

  const select = useCallback(
    (key: K) => {
      setSelected((current) => (mode === "single" ? new Set([key]) : new Set(current).add(key)))
    },
    [mode, setSelected],
  )
  const deselect = useCallback(
    (key: K) => {
      setSelected((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
    },
    [setSelected],
  )
  const toggle = useCallback(
    (key: K) => {
      setSelected((current) => {
        if (current.has(key)) {
          const next = new Set(current)
          next.delete(key)
          return next
        }
        return mode === "single" ? new Set([key]) : new Set(current).add(key)
      })
    },
    [mode, setSelected],
  )
  const clear = useCallback(() => setSelected(new Set()), [setSelected])
  const isSelected = useCallback((key: K) => selected.has(key), [selected])

  return useMemo(
    () => ({ selected, isSelected, toggle, select, deselect, clear, setSelected }),
    [selected, isSelected, toggle, select, deselect, clear, setSelected],
  )
}
