import { useCallback, useMemo } from "react"
import { useControllableState } from "./use-controllable-state"

/** Options for {@link useListState}. */
export interface UseListStateOptions<T> {
  /** Controlled items; when defined the hook never owns the array. */
  readonly value?: readonly T[] | undefined
  /** Initial items while uncontrolled. Defaults to empty. */
  readonly defaultValue?: readonly T[] | undefined
  /** Called with the requested next items. */
  readonly onChange?: ((items: readonly T[]) => void) | undefined
}

/** An ordered collection with immutable edit helpers. */
export interface ListState<T> {
  readonly items: readonly T[]
  readonly set: (items: readonly T[]) => void
  readonly append: (...items: T[]) => void
  readonly prepend: (...items: T[]) => void
  readonly insert: (index: number, ...items: T[]) => void
  readonly removeAt: (index: number) => void
  readonly updateAt: (index: number, item: T) => void
  readonly move: (from: number, to: number) => void
  readonly clear: () => void
}

const EMPTY: readonly never[] = []

// Clamp an insertion target into `[0, length]` so an out-of-range index appends rather than
// tearing a hole in the array.
function clampIndex(index: number, length: number): number {
  if (index < 0) return 0
  if (index > length) return length
  return index
}

/**
 * Controlled/uncontrolled ordered list with immutable helpers — the state behind reorderable rows,
 * tag inputs, and repeatable form sections. Every helper returns a fresh array; an out-of-range
 * insert index is clamped rather than throwing, and `move` is a no-op when either endpoint is out
 * of range.
 */
export function useListState<T>(options: UseListStateOptions<T> = {}): ListState<T> {
  const [items, setItems] = useControllableState<readonly T[]>({
    value: options.value,
    defaultValue: options.defaultValue ?? (EMPTY as readonly T[]),
    onChange: options.onChange,
  })

  const set = useCallback((next: readonly T[]) => setItems(next), [setItems])
  const append = useCallback(
    (...added: T[]) => setItems((current) => [...current, ...added]),
    [setItems],
  )
  const prepend = useCallback(
    (...added: T[]) => setItems((current) => [...added, ...current]),
    [setItems],
  )
  const insert = useCallback(
    (index: number, ...added: T[]) =>
      setItems((current) => {
        const at = clampIndex(index, current.length)
        return [...current.slice(0, at), ...added, ...current.slice(at)]
      }),
    [setItems],
  )
  const removeAt = useCallback(
    (index: number) => setItems((current) => current.filter((_, position) => position !== index)),
    [setItems],
  )
  const updateAt = useCallback(
    (index: number, item: T) =>
      setItems((current) =>
        current.map((existing, position) => (position === index ? item : existing)),
      ),
    [setItems],
  )
  const move = useCallback(
    (from: number, to: number) =>
      setItems((current) => {
        if (from < 0 || from >= current.length || to < 0 || to >= current.length) return current
        const next = [...current]
        const removed = next.splice(from, 1)
        if (removed.length === 0) return current
        next.splice(to, 0, removed[0] as T)
        return next
      }),
    [setItems],
  )
  const clear = useCallback(() => setItems([]), [setItems])

  return useMemo(
    () => ({ items, set, append, prepend, insert, removeAt, updateAt, move, clear }),
    [items, set, append, prepend, insert, removeAt, updateAt, move, clear],
  )
}
