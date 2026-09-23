import { type SourceEvent, type SourceId, sourceKey } from "../protocol"
import { assertPositiveCapacity } from "./capacity"

/** A retained event with the identity and sequence needed to order and deduplicate it. */
export interface RetentionEntry {
  readonly id: SourceId
  readonly seq: number
  readonly event: SourceEvent
}

/** Fixed capacities for the two retention views. */
export interface RetentionCapacity {
  readonly perSource: number
  readonly aggregate: number
}

/**
 * Bounded event history with two views: a per-source ring and one aggregate timeline. Both drop the
 * oldest entry on overflow and count what they lost, so the panel can show that observation is
 * incomplete rather than silently missing rows. A late-connecting client replays from here.
 */
export interface RetentionBuffer {
  /** Retain an event in both the aggregate timeline and its source's ring. */
  push(entry: RetentionEntry): void
  /** The aggregate timeline, oldest first. */
  aggregate(): readonly RetentionEntry[]
  /** One source's retained events, oldest first. */
  perSource(id: SourceId): readonly RetentionEntry[]
  /** Total entries evicted from the aggregate timeline. */
  droppedAggregate(): number
  /** Entries evicted from one source's ring. */
  droppedForSource(id: SourceId): number
  /** Release a source's retained entries and drop counter (on source removal). */
  forget(id: SourceId): void
  /** Discard all history and reset every drop counter. */
  clear(): void
}

interface Ring {
  entries: RetentionEntry[]
  dropped: number
}

/**
 * Create a {@link RetentionBuffer} with the given fixed capacities. Capacities must be positive; an
 * adapter that produces bursts should sample or coalesce before pushing rather than growing these.
 */
export function createRetentionBuffer(capacity: RetentionCapacity): RetentionBuffer {
  assertCapacity("perSource", capacity.perSource)
  assertCapacity("aggregate", capacity.aggregate)
  const aggregate: Ring = { entries: [], dropped: 0 }
  const perSource = new Map<string, Ring>()

  function ringFor(id: SourceId): Ring {
    const key = sourceKey(id)
    let ring = perSource.get(key)
    if (!ring) {
      ring = { entries: [], dropped: 0 }
      perSource.set(key, ring)
    }
    return ring
  }

  function retain(ring: Ring, entry: RetentionEntry, limit: number): void {
    ring.entries.push(entry)
    while (ring.entries.length > limit) {
      ring.entries.shift()
      ring.dropped += 1
    }
  }

  return {
    push(entry) {
      retain(aggregate, entry, capacity.aggregate)
      retain(ringFor(entry.id), entry, capacity.perSource)
    },
    aggregate: () => aggregate.entries.slice(),
    perSource: (id) => (perSource.get(sourceKey(id))?.entries ?? []).slice(),
    droppedAggregate: () => aggregate.dropped,
    droppedForSource: (id) => perSource.get(sourceKey(id))?.dropped ?? 0,
    forget(id) {
      const key = sourceKey(id)
      perSource.delete(key)
      aggregate.entries = aggregate.entries.filter((entry) => sourceKey(entry.id) !== key)
    },
    clear() {
      aggregate.entries = []
      aggregate.dropped = 0
      perSource.clear()
    },
  }
}

function assertCapacity(name: keyof RetentionCapacity, value: number): void {
  assertPositiveCapacity(`Retention ${name} capacity`, value)
}
