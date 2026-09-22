import type { ErrorSnapshot, Subscription } from "@plainworks/std"
import { type SourceDescriptor, type SourceId, sourceKey } from "../protocol"
import type { RetentionEntry } from "../retention"
import type { DevtoolsClientPort, DevtoolsSnapshot, IndicatorEntry } from "../session/client-port"

/** The immutable view the client renders; replaced wholesale whenever any slice changes. */
export interface DevtoolsStoreState {
  /** Discovered sources in registration order. */
  readonly sources: readonly SourceDescriptor[]
  /** Latest source-local failure per source key; a source stays listed while failed. */
  readonly failures: ReadonlyMap<string, ErrorSnapshot>
  /** The visible timeline, oldest first, bounded to the store capacity. */
  readonly events: readonly RetentionEntry[]
  /** Latest indicator values across all sources. */
  readonly indicators: readonly IndicatorEntry[]
  /** Host-reported aggregate drop count (events lost before the client ever saw them). */
  readonly droppedAggregate: number
  /** Host-reported drop count per source key. */
  readonly droppedBySource: ReadonlyMap<string, number>
  /** Whether live event collection is paused. */
  readonly paused: boolean
  /** Whether the session behind the port has been disposed. */
  readonly disposed: boolean
}

/** Options for {@link createDevtoolsStore}. */
export interface DevtoolsStoreOptions {
  /** Maximum visible timeline entries; the oldest drop on overflow. Defaults to 500. */
  readonly capacity?: number
}

/**
 * The client-side model of a session: a host-free external store over a {@link DevtoolsClientPort},
 * shaped for `useSyncExternalStore` but usable by any renderer. It hydrates from the port snapshot,
 * reduces live messages into immutable state, and owns the presentation policies that stay safe
 * without host cooperation: pause (live events stop applying, nothing accumulates), resume
 * (rehydrate from the authoritative snapshot), and clear (a per-source high-water mark keeps
 * cleared history out of later rehydrations). It deliberately does not build on
 * `@plainworks/state`: that seam is zustand-backed app state with scope/persistence concerns,
 * while this is a dev-only message reducer whose guarantees (per-source sequence guards, clear
 * high-water marks) live in the reduction itself, not in a generic store.
 */
export interface DevtoolsStore {
  /** The current immutable state; identity changes only when the content does. */
  getSnapshot(): DevtoolsStoreState
  /** Subscribe to state changes; returns teardown. */
  subscribe(listener: () => void): Subscription
  /** Stop applying live events. Discovery, indicators, and failures still apply. */
  pause(): void
  /** Resume live events, rehydrating the timeline from the port snapshot first. */
  resume(): void
  /** Empty the visible timeline; cleared entries stay hidden across later rehydrations. */
  clear(): void
  /** Unsubscribe from the port and freeze the state. Idempotent. */
  dispose(): void
}

const DEFAULT_CAPACITY = 500

interface Model {
  sources: Map<string, SourceDescriptor>
  failures: Map<string, ErrorSnapshot>
  events: RetentionEntry[]
  indicators: Map<string, Map<string, IndicatorEntry>>
  droppedAggregate: number
  droppedBySource: Map<string, number>
  lastSeq: Map<string, number>
  clearedSeq: Map<string, number>
  paused: boolean
  disposed: boolean
}

/**
 * Create a {@link DevtoolsStore} over a client port. Subscribes before hydrating so no live
 * message is lost between the two; per-source sequence guards reject replayed or stale events.
 */
export function createDevtoolsStore(
  port: DevtoolsClientPort,
  options: DevtoolsStoreOptions = {},
): DevtoolsStore {
  const capacity = options.capacity ?? DEFAULT_CAPACITY
  if (!Number.isSafeInteger(capacity) || capacity <= 0) {
    throw new RangeError("Store capacity must be a positive safe integer.")
  }
  const listeners = new Set<() => void>()

  const model: Model = {
    sources: new Map(),
    failures: new Map(),
    events: [],
    indicators: new Map(),
    droppedAggregate: 0,
    droppedBySource: new Map(),
    lastSeq: new Map(),
    clearedSeq: new Map(),
    paused: false,
    disposed: false,
  }

  let state: DevtoolsStoreState = snapshotOf(model)
  let disposed = false

  function snapshotOf(next: Model): DevtoolsStoreState {
    return {
      sources: [...next.sources.values()],
      failures: new Map(next.failures),
      events: [...next.events],
      indicators: [...next.indicators.values()].flatMap((entries) => [...entries.values()]),
      droppedAggregate: next.droppedAggregate,
      droppedBySource: new Map(next.droppedBySource),
      paused: next.paused,
      disposed: next.disposed,
    }
  }

  function publish(mutate: () => boolean): void {
    if (disposed || model.disposed) return
    if (!mutate()) return
    state = snapshotOf(model)
    for (const listener of [...listeners]) listener()
  }

  function pushEvent(entry: RetentionEntry): boolean {
    if (model.paused) return false
    const key = sourceKey(entry.id)
    if (entry.seq <= (model.lastSeq.get(key) ?? 0)) return false
    model.lastSeq.set(key, entry.seq)
    model.events.push(entry)
    if (model.events.length > capacity) {
      model.events.splice(0, model.events.length - capacity)
    }
    return true
  }

  function removeSource(id: SourceId): boolean {
    const key = sourceKey(id)
    const hadEvents = model.events.some((entry) => sourceKey(entry.id) === key)
    model.events = model.events.filter((entry) => sourceKey(entry.id) !== key)
    // Every delete must run — no `||` chain, which would short-circuit after the first `true`.
    const removed = [
      model.sources.delete(key),
      model.failures.delete(key),
      model.indicators.delete(key),
      model.droppedBySource.delete(key),
      model.lastSeq.delete(key),
      model.clearedSeq.delete(key),
      hadEvents,
    ]
    return removed.some(Boolean)
  }

  function hydrate(snapshot: DevtoolsSnapshot): boolean {
    model.sources = new Map(snapshot.sources.map((source) => [sourceKey(source.id), source]))
    model.failures = new Map(snapshot.failures.map((entry) => [sourceKey(entry.id), entry.error]))
    model.indicators = new Map()
    for (const entry of snapshot.indicators) {
      const key = sourceKey(entry.id)
      let entries = model.indicators.get(key)
      if (!entries) {
        entries = new Map()
        model.indicators.set(key, entries)
      }
      entries.set(entry.indicator.id, entry)
    }
    model.droppedAggregate = snapshot.droppedAggregate
    model.droppedBySource = new Map(
      (snapshot.droppedBySource ?? []).map((entry) => [sourceKey(entry.id), entry.count]),
    )
    model.events = []
    for (const entry of snapshot.events) pushReplayed(entry)
    return true
  }

  function pushReplayed(entry: RetentionEntry): void {
    const key = sourceKey(entry.id)
    if (entry.seq <= (model.clearedSeq.get(key) ?? 0)) return
    if (entry.seq > (model.lastSeq.get(key) ?? 0)) model.lastSeq.set(key, entry.seq)
    if (
      model.events.some((existing) => sourceKey(existing.id) === key && existing.seq === entry.seq)
    ) {
      return
    }
    model.events.push(entry)
    if (model.events.length > capacity) {
      model.events.splice(0, model.events.length - capacity)
    }
  }

  const subscription = port.subscribe((message) => {
    switch (message.type) {
      case "source-added":
        publish(() => {
          const key = sourceKey(message.source.id)
          const existing = model.sources.get(key)
          model.failures.delete(key)
          if (existing === message.source) return false
          model.sources.set(key, message.source)
          return true
        })
        break
      case "source-removed":
        publish(() => removeSource(message.id))
        break
      case "source-failed":
        publish(() => {
          model.failures.set(sourceKey(message.id), message.error)
          return true
        })
        break
      case "source-recovered":
        publish(() => model.failures.delete(sourceKey(message.id)))
        break
      case "event":
        publish(() => pushEvent({ id: message.id, seq: message.seq, event: message.event }))
        break
      case "indicator":
        publish(() => {
          const key = sourceKey(message.id)
          let entries = model.indicators.get(key)
          if (!entries) {
            entries = new Map()
            model.indicators.set(key, entries)
          }
          const current = entries.get(message.indicator.id)
          if (current?.indicator === message.indicator) return false
          entries.set(message.indicator.id, { id: message.id, indicator: message.indicator })
          return true
        })
        break
      case "dropped":
        publish(() => {
          if (message.id === null) {
            if (model.droppedAggregate === message.count) return false
            model.droppedAggregate = message.count
          } else {
            model.droppedBySource.set(sourceKey(message.id), message.count)
          }
          return true
        })
        break
      case "disposed":
        if (!disposed && !model.disposed) {
          model.disposed = true
          state = snapshotOf(model)
          for (const listener of [...listeners]) listener()
        }
        break
      default:
        // Detail/command results are correlated by the port, not the store.
        break
    }
  })
  publish(() => hydrate(port.snapshot()))

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      if (disposed) return { unsubscribe: () => {} }
      listeners.add(listener)
      return {
        unsubscribe: () => {
          listeners.delete(listener)
        },
      }
    },
    pause() {
      publish(() => {
        if (model.paused) return false
        model.paused = true
        return true
      })
    },
    resume() {
      publish(() => {
        if (!model.paused) return false
        model.paused = false
        hydrate(port.snapshot())
        return true
      })
    },
    clear() {
      publish(() => {
        for (const [key, seq] of model.lastSeq) {
          model.clearedSeq.set(key, Math.max(model.clearedSeq.get(key) ?? 0, seq))
        }
        if (model.events.length === 0 && model.clearedSeq.size === 0) return false
        model.events = []
        return true
      })
    },
    dispose() {
      if (disposed) return
      disposed = true
      subscription.unsubscribe()
      listeners.clear()
    },
  }
}
