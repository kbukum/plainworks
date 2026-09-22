import type { Subscription } from "@plainworks/std"
import { describe, expect, it, vi } from "vitest"
import type { DevtoolsMessage, SourceDescriptor, SourceEvent, SourceId } from "../protocol"
import type { RetentionEntry } from "../retention"
import type { DevtoolsClientPort, DevtoolsSnapshot } from "../session/client-port"
import { createDevtoolsStore, type DevtoolsStoreState } from "./store"

const http: SourceId = { kind: "http", instance: "api" }
const state: SourceId = { kind: "state", instance: "cart" }

function descriptor(id: SourceId, label = `${id.kind} ${id.instance}`): SourceDescriptor {
  return { id, label, commands: [] }
}

function event(kind: string, at: number, label = kind): SourceEvent {
  return { kind, label, severity: "info", at }
}

function entry(id: SourceId, seq: number, at: number): RetentionEntry {
  return { id, seq, event: event("request", at) }
}

function emptySnapshot(): DevtoolsSnapshot {
  return {
    sources: [],
    events: [],
    indicators: [],
    failures: [],
    droppedAggregate: 0,
    droppedBySource: [],
  }
}

interface FakePort {
  readonly port: DevtoolsClientPort
  emit(message: DevtoolsMessage): void
  setSnapshot(snapshot: DevtoolsSnapshot): void
  readonly listenerCount: number
}

function fakePort(initial: DevtoolsSnapshot = emptySnapshot()): FakePort {
  let current = initial
  const listeners = new Set<(message: DevtoolsMessage) => void>()
  return {
    port: {
      subscribe(listener) {
        listeners.add(listener)
        return {
          unsubscribe: () => {
            listeners.delete(listener)
          },
        }
      },
      snapshot: () => current,
      requestDetail: () => Promise.reject(new Error("not used in store tests")),
      runCommand: () => Promise.reject(new Error("not used in store tests")),
      dispose: () => {},
    },
    emit(message) {
      for (const listener of [...listeners]) listener(message)
    },
    setSnapshot(snapshot) {
      current = snapshot
    },
    get listenerCount() {
      return listeners.size
    },
  }
}

describe("createDevtoolsStore", () => {
  it("hydrates sources, events, indicators, and dropped count from the snapshot", () => {
    const fake = fakePort({
      sources: [descriptor(http)],
      events: [entry(http, 1, 100), entry(http, 2, 200)],
      indicators: [
        {
          id: http,
          indicator: {
            id: "health",
            label: "HTTP",
            value: "2 in flight",
            severity: "ok",
            updatedAt: 200,
          },
        },
      ],
      failures: [],
      droppedAggregate: 3,
      droppedBySource: [{ id: http, count: 2 }],
    })
    const store = createDevtoolsStore(fake.port)
    const snapshot = store.getSnapshot()
    expect(snapshot.sources).toEqual([descriptor(http)])
    expect(snapshot.events).toHaveLength(2)
    expect(snapshot.indicators).toHaveLength(1)
    expect(snapshot.droppedAggregate).toBe(3)
    expect(snapshot.droppedBySource.get("4:httpapi")).toBe(2)
    expect(snapshot.paused).toBe(false)
    expect(snapshot.disposed).toBe(false)
  })

  it("validates capacity as a positive safe integer", () => {
    const fake = fakePort()
    expect(() => createDevtoolsStore(fake.port, { capacity: 0 })).toThrow(RangeError)
    expect(() => createDevtoolsStore(fake.port, { capacity: -5 })).toThrow(RangeError)
    expect(() => createDevtoolsStore(fake.port, { capacity: Number.NaN })).toThrow(RangeError)
    expect(() => createDevtoolsStore(fake.port, { capacity: Number.POSITIVE_INFINITY })).toThrow(
      RangeError,
    )
    expect(() => createDevtoolsStore(fake.port, { capacity: 10.5 })).toThrow(RangeError)
  })

  it("keeps the same snapshot reference while nothing changed", () => {
    const fake = fakePort()
    const store = createDevtoolsStore(fake.port)
    expect(store.getSnapshot()).toBe(store.getSnapshot())
    fake.emit({
      type: "detail-result",
      requestId: "r1",
      ok: false,
      error: { name: "E", message: "m" },
    })
    expect(store.getSnapshot()).toBe(store.getSnapshot())
  })

  it("applies source discovery and removal, notifying listeners", () => {
    const fake = fakePort()
    const store = createDevtoolsStore(fake.port)
    const listener = vi.fn()
    store.subscribe(listener)

    fake.emit({ type: "source-added", source: descriptor(http) })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().sources.map((source) => source.id)).toEqual([http])

    fake.emit({ type: "source-removed", id: http })
    expect(store.getSnapshot().sources).toEqual([])
  })

  it("appends live events in order and rejects a stale sequence for the same source", () => {
    const fake = fakePort({ ...emptySnapshot(), sources: [descriptor(http)] })
    const store = createDevtoolsStore(fake.port)
    fake.emit({ type: "event", id: http, seq: 1, event: event("a", 1) })
    fake.emit({ type: "event", id: http, seq: 2, event: event("b", 2) })
    fake.emit({ type: "event", id: http, seq: 2, event: event("duplicate", 3) })
    fake.emit({ type: "event", id: http, seq: 1, event: event("stale", 0) })
    expect(store.getSnapshot().events.map((item) => item.event.kind)).toEqual(["a", "b"])
  })

  it("bounds the visible timeline to its capacity, dropping the oldest entries", () => {
    const fake = fakePort()
    const store = createDevtoolsStore(fake.port, { capacity: 3 })
    for (let seq = 1; seq <= 5; seq += 1) {
      fake.emit({ type: "event", id: http, seq, event: event(`e${seq}`, seq) })
    }
    expect(store.getSnapshot().events.map((item) => item.event.kind)).toEqual(["e3", "e4", "e5"])
  })

  it("replaces an indicator in place and records dropped counts", () => {
    const fake = fakePort()
    const store = createDevtoolsStore(fake.port)
    const first = {
      id: "health",
      label: "HTTP",
      value: "idle",
      severity: "ok" as const,
      updatedAt: 1,
    }
    const second = { ...first, value: "1 in flight", severity: "info" as const, updatedAt: 2 }
    fake.emit({ type: "indicator", id: http, indicator: first })
    fake.emit({ type: "indicator", id: http, indicator: second })
    expect(store.getSnapshot().indicators).toEqual([{ id: http, indicator: second }])

    fake.emit({ type: "dropped", id: null, count: 7 })
    fake.emit({ type: "dropped", id: http, count: 2 })
    expect(store.getSnapshot().droppedAggregate).toBe(7)
  })

  it("records a source failure without removing the source, and clears it on re-add", () => {
    const fake = fakePort()
    const store = createDevtoolsStore(fake.port)
    fake.emit({ type: "source-added", source: descriptor(http) })
    fake.emit({
      type: "source-failed",
      id: http,
      error: { name: "PlainError", message: "boom" },
    })
    expect(store.getSnapshot().failures.size).toBe(1)
    expect(store.getSnapshot().sources).toHaveLength(1)

    fake.emit({ type: "source-removed", id: http })
    expect(store.getSnapshot().failures.size).toBe(0)
  })

  it("clears a failure when the source recovers", () => {
    const fake = fakePort()
    const store = createDevtoolsStore(fake.port)
    fake.emit({ type: "source-added", source: descriptor(http) })
    fake.emit({
      type: "source-failed",
      id: http,
      error: { name: "PlainError", message: "boom" },
    })
    expect(store.getSnapshot().failures.size).toBe(1)
    fake.emit({ type: "source-recovered", id: http })
    expect(store.getSnapshot().failures.size).toBe(0)
    expect(store.getSnapshot().sources).toHaveLength(1)
  })

  it("drops a removed source's events, indicators, and drop counts", () => {
    const fake = fakePort()
    const store = createDevtoolsStore(fake.port)
    fake.emit({ type: "source-added", source: descriptor(http) })
    fake.emit({ type: "source-added", source: descriptor(state) })
    fake.emit({ type: "event", id: http, seq: 1, event: event("a", 1) })
    fake.emit({ type: "event", id: state, seq: 1, event: event("b", 2) })
    fake.emit({
      type: "indicator",
      id: http,
      indicator: { id: "h", label: "HTTP", value: "ok", severity: "ok", updatedAt: 1 },
    })
    fake.emit({ type: "source-removed", id: http })
    const snapshot = store.getSnapshot()
    expect(snapshot.events.map((item) => item.id)).toEqual([state])
    expect(snapshot.indicators).toEqual([])
  })

  it("stops collecting events while paused and rehydrates from the snapshot on resume", () => {
    const fake = fakePort({ ...emptySnapshot(), sources: [descriptor(http)] })
    const store = createDevtoolsStore(fake.port)
    fake.emit({ type: "event", id: http, seq: 1, event: event("before", 1) })

    store.pause()
    expect(store.getSnapshot().paused).toBe(true)
    fake.emit({ type: "event", id: http, seq: 2, event: event("during-pause", 2) })
    expect(store.getSnapshot().events.map((item) => item.event.kind)).toEqual(["before"])

    // While paused the host kept collecting; the new snapshot carries the missed event.
    fake.setSnapshot({
      ...emptySnapshot(),
      sources: [descriptor(http)],
      events: [entry(http, 1, 1), entry(http, 2, 2)],
    })
    store.resume()
    expect(store.getSnapshot().paused).toBe(false)
    expect(store.getSnapshot().events).toHaveLength(2)
  })

  it("still applies discovery and indicators while paused", () => {
    const fake = fakePort()
    const store = createDevtoolsStore(fake.port)
    store.pause()
    fake.emit({ type: "source-added", source: descriptor(http) })
    fake.emit({
      type: "indicator",
      id: http,
      indicator: { id: "h", label: "HTTP", value: "ok", severity: "ok", updatedAt: 1 },
    })
    expect(store.getSnapshot().sources).toHaveLength(1)
    expect(store.getSnapshot().indicators).toHaveLength(1)
  })

  it("clears the visible timeline and keeps cleared entries out of a later rehydration", () => {
    const fake = fakePort({ ...emptySnapshot(), sources: [descriptor(http)] })
    const store = createDevtoolsStore(fake.port)
    fake.emit({ type: "event", id: http, seq: 1, event: event("a", 1) })
    fake.emit({ type: "event", id: http, seq: 2, event: event("b", 2) })
    store.clear()
    expect(store.getSnapshot().events).toEqual([])

    // Live events after the clear still flow in.
    fake.emit({ type: "event", id: http, seq: 3, event: event("c", 3) })
    expect(store.getSnapshot().events.map((item) => item.event.kind)).toEqual(["c"])

    // A resume rehydrates from the host, which still retains a and b; the clear holds.
    fake.setSnapshot({
      ...emptySnapshot(),
      sources: [descriptor(http)],
      events: [entry(http, 1, 1), entry(http, 2, 2), entry(http, 3, 3)],
    })
    store.pause()
    store.resume()
    expect(store.getSnapshot().events.map((item) => item.seq)).toEqual([3])
  })

  it("marks the state disposed when the session disposes and ignores later messages", () => {
    const fake = fakePort()
    const store = createDevtoolsStore(fake.port)
    const listener = vi.fn()
    store.subscribe(listener)
    fake.emit({ type: "disposed" })
    expect(store.getSnapshot().disposed).toBe(true)

    listener.mockClear()
    fake.emit({ type: "source-added", source: descriptor(http) })
    expect(listener).not.toHaveBeenCalled()
    expect(store.getSnapshot().sources).toEqual([])
  })

  it("unsubscribes from the port on dispose", () => {
    const fake = fakePort()
    const store = createDevtoolsStore(fake.port)
    expect(fake.listenerCount).toBe(1)
    store.dispose()
    expect(fake.listenerCount).toBe(0)
  })

  it("notifies once even when a listener unsubscribes mid-delivery", () => {
    const fake = fakePort()
    const store = createDevtoolsStore(fake.port)
    const second = vi.fn()
    // The first listener removes `second` before its turn. Delivery iterates a snapshot of the
    // listener set, so `second` is still invoked exactly once — a live-set iteration would skip it.
    let secondSub: Subscription | undefined
    store.subscribe(() => {
      secondSub?.unsubscribe()
    })
    secondSub = store.subscribe(second)
    fake.emit({ type: "source-added", source: descriptor(http) })
    expect(second).toHaveBeenCalledTimes(1)
  })
})

describe("filterEvents", () => {
  it("filters by source, severity, and kind substring, case-insensitively", async () => {
    const { filterEvents } = await import("./filters")
    const events: readonly RetentionEntry[] = [
      { id: http, seq: 1, event: { kind: "request", label: "GET /a", severity: "ok", at: 1 } },
      {
        id: http,
        seq: 2,
        event: { kind: "retry", label: "retry GET /a", severity: "warn", at: 2 },
      },
      { id: state, seq: 1, event: { kind: "request", label: "set", severity: "error", at: 3 } },
    ]
    expect(filterEvents(events, {})).toHaveLength(3)
    expect(filterEvents(events, { source: http })).toHaveLength(2)
    expect(filterEvents(events, { severity: "warn" })).toHaveLength(1)
    expect(filterEvents(events, { kind: "REQ" })).toHaveLength(2)
    expect(
      filterEvents(events, { source: state, severity: "error", kind: "request" }),
    ).toHaveLength(1)
    expect(filterEvents(events, { severity: "info" })).toHaveLength(0)
  })
})

// Type-level guard: the public state stays deeply readonly for useSyncExternalStore consumers.
const _stateTypeCheck: DevtoolsStoreState | undefined = undefined
void _stateTypeCheck
