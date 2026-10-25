import type { StateSource } from "@plainworks/std/seam"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

/** Options for {@link useTray}. */
export interface UseTrayOptions<T> {
  /** The stable key of an item; an item whose key is already in the tray is not added again. */
  readonly getKey: (item: T) => string
  /** The most items the tray holds. A positive integer; defaults to 8. */
  readonly limit?: number
  /**
   * Where the tray is kept, such as a source from a session-storage scope so it survives a reload
   * in the same tab. Validate stored items with the scope's schema; they are untrusted. Omit it to
   * keep the tray in memory. Pass the same source on every render; a new one starts an empty tray
   * and reads it from the new source.
   */
  readonly source?: StateSource<readonly T[]> | undefined
}

/** A small, ordered set of picked items, such as the models staged for a comparison. */
export interface Tray<T> {
  /** The items in pick order; an item's place is its slot. */
  readonly items: readonly T[]
  /** False until the stored tray has been read. */
  readonly ready: boolean
  /**
   * True once the tray holds a choice: a stored tray, or any add, remove, replace or clear. An
   * emptied tray stays touched, so a host never refills a tray the user cleared.
   */
  readonly touched: boolean
  readonly full: boolean
  /** The last failed read or write, cleared by the next successful one. */
  readonly error: unknown
  readonly has: (key: string) => boolean
  /** Adds an item at the end. Returns false when it is already there or the tray is full. */
  readonly add: (item: T) => boolean
  readonly remove: (key: string) => void
  /** Sets the items, dropping duplicates and anything past the limit. */
  readonly replace: (items: readonly T[]) => void
  readonly clear: () => void
}

interface TrayState<T> {
  readonly source: StateSource<readonly T[]> | undefined
  readonly items: readonly T[]
  readonly touched: boolean
  readonly ready: boolean
  readonly error: unknown
}

// One write at a time per source, newest last: a change made while a write is out waits and
// replaces any change still waiting, so a slow older write never lands after a newer one.
interface Writer<T> {
  readonly source: StateSource<readonly T[]>
  writing: boolean
  queued: readonly T[] | undefined
}

function fresh<T>(source: StateSource<readonly T[]> | undefined): TrayState<T> {
  return { source, items: [], touched: false, ready: source === undefined, error: undefined }
}

/**
 * Keeps a small ordered set of picked items, optionally in a {@link StateSource} so it survives a
 * reload and follows changes made elsewhere. Order is pick order, so removing an item moves the
 * later ones up a slot. A pick made before the stored tray is read wins over the stored one. A new
 * source starts an empty, unread tray; writes still out to the old source finish there.
 */
export function useTray<T>({ getKey, limit = 8, source }: UseTrayOptions<T>): Tray<T> {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`Invalid tray limit ${limit}`)
  const [stored, setStored] = useState<TrayState<T>>(() => fresh(source))
  // A new source resets the tray during render, so no frame shows the old source's items.
  let state = stored
  if (stored.source !== source) {
    state = fresh(source)
    setStored(state)
  }
  const update = useCallback(
    (from: StateSource<readonly T[]> | undefined, patch: Partial<TrayState<T>>) =>
      setStored((s) => (s.source === from ? { ...s, ...patch } : s)),
    [],
  )
  // Bumped by every local change, so a read that started earlier never overwrites it.
  const revision = useRef(0)
  const latest = useRef(state)
  latest.current = state
  const keyOf = useRef(getKey)
  keyOf.current = getKey
  const writer = useRef<Writer<T> | undefined>(undefined)
  const writing = useCallback(
    (from: StateSource<readonly T[]>): boolean =>
      writer.current?.source === from && writer.current.writing,
    [],
  )

  useEffect(() => {
    if (source === undefined) return
    let live = true
    const read = (): void => {
      const started = revision.current
      const duringWrite = writing(source)
      source.get().then(
        (value) => {
          if (!live) return
          // A read that overlaps this tray's own writes may see a value it has since replaced.
          if (revision.current !== started || duringWrite || writing(source))
            update(source, { ready: true, error: undefined })
          else
            update(source, {
              items: value ?? [],
              touched: value !== undefined,
              ready: true,
              error: undefined,
            })
        },
        (cause: unknown) => {
          if (live) update(source, { ready: true, error: cause })
        },
      )
    }
    read()
    const subscription = source.subscribe(read)
    return () => {
      live = false
      subscription.unsubscribe()
    }
  }, [source, update, writing])

  const commit = useCallback(
    (next: readonly T[]) => {
      revision.current += 1
      latest.current = { ...latest.current, items: next, touched: true }
      update(source, { items: next, touched: true })
      if (source === undefined) return
      if (writer.current?.source !== source)
        writer.current = { source, writing: false, queued: undefined }
      const own = writer.current
      own.queued = next
      if (own.writing) return
      own.writing = true
      const flush = async (): Promise<void> => {
        for (let items = own.queued; items !== undefined; items = own.queued) {
          own.queued = undefined
          try {
            await own.source.set(items)
            update(own.source, { error: undefined })
          } catch (cause) {
            update(own.source, { error: cause })
          }
        }
        own.writing = false
      }
      void flush()
    },
    [source, update],
  )

  const dedupe = useCallback(
    (items: readonly T[]): T[] => {
      const seen = new Set<string>()
      const kept: T[] = []
      for (const item of items) {
        const itemKey = keyOf.current(item)
        if (seen.has(itemKey) || kept.length === limit) continue
        seen.add(itemKey)
        kept.push(item)
      }
      return kept
    },
    [limit],
  )

  const has = useCallback(
    (key: string) => latest.current.items.some((item) => keyOf.current(item) === key),
    [],
  )
  const add = useCallback(
    (item: T) => {
      const items = latest.current.items
      if (items.length >= limit || has(keyOf.current(item))) return false
      commit([...items, item])
      return true
    },
    [commit, has, limit],
  )
  const remove = useCallback(
    (key: string) => commit(latest.current.items.filter((item) => keyOf.current(item) !== key)),
    [commit],
  )
  const replace = useCallback((items: readonly T[]) => commit(dedupe(items)), [commit, dedupe])
  const clear = useCallback(() => commit([]), [commit])

  return useMemo(
    () => ({
      items: state.items,
      ready: state.ready,
      touched: state.touched,
      full: state.items.length >= limit,
      error: state.error,
      has,
      add,
      remove,
      replace,
      clear,
    }),
    [state, limit, has, add, remove, replace, clear],
  )
}
