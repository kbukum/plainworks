import { describe, expect, it, vi } from "vitest"
import type { SourceEvent, StatusIndicator } from "../protocol"
import type { SourceObserver } from "../source"
import { createObserverRelay, observeSafely } from "./observer-relay"

function fakeObserver(): SourceObserver & {
  readonly events: SourceEvent[]
  readonly indicators: StatusIndicator[]
  readonly failures: unknown[]
  readonly recoveries: number
} {
  const events: SourceEvent[] = []
  const indicators: StatusIndicator[] = []
  const failures: unknown[] = []
  let recoveries = 0
  return {
    events,
    indicators,
    failures,
    get recoveries() {
      return recoveries
    },
    emit: (event) => {
      events.push(event)
    },
    indicate: (indicator) => {
      indicators.push(indicator)
    },
    fail: (error) => {
      failures.push(error)
    },
    recover: () => {
      recoveries += 1
    },
  }
}

const sampleEvent: SourceEvent = { kind: "test", label: "hi", severity: "info", at: 1 }
const sampleIndicator: StatusIndicator = {
  id: "status",
  label: "Status",
  value: "open",
  severity: "ok",
  updatedAt: 1,
}

describe("createObserverRelay", () => {
  it("drops emissions until a source connects, so pre-connect work is never buffered", () => {
    const relay = createObserverRelay()
    // No observer is bound yet; these must be safe no-ops rather than throwing or queuing.
    expect(() => {
      relay.emit(sampleEvent)
      relay.indicate(sampleIndicator)
      relay.fail(new Error("boom"))
      relay.recover()
    }).not.toThrow()

    const observer = fakeObserver()
    relay.bind(observer)
    relay.emit({ ...sampleEvent, label: "after" })
    expect(observer.events.map((event) => event.label)).toEqual(["after"])
    expect(observer.failures).toHaveLength(0)
  })

  it("replays only the latest indicator per id on bind, so a late client sees current status", () => {
    const relay = createObserverRelay()
    relay.indicate({ ...sampleIndicator, value: "connecting" })
    relay.indicate({ ...sampleIndicator, value: "open" })
    relay.indicate({ id: "drops", label: "Drops", value: "0", severity: "ok", updatedAt: 1 })

    const observer = fakeObserver()
    relay.bind(observer)

    const replayed = new Map(observer.indicators.map((entry) => [entry.id, entry.value]))
    expect(replayed.get("status")).toBe("open")
    expect(replayed.get("drops")).toBe("0")
    expect(observer.indicators).toHaveLength(2)
  })

  it("forwards live calls to the bound observer and stops after unbind", () => {
    const relay = createObserverRelay()
    const observer = fakeObserver()
    const unbind = relay.bind(observer)

    relay.emit(sampleEvent)
    relay.fail(new Error("x"))
    relay.recover()
    expect(observer.events).toHaveLength(1)
    expect(observer.failures).toHaveLength(1)
    expect(observer.recoveries).toBe(1)

    unbind()
    relay.emit(sampleEvent)
    expect(observer.events).toHaveLength(1)
  })

  it("rebinds to a fresh observer and replays the latest indicator to it", () => {
    const relay = createObserverRelay()
    const first = fakeObserver()
    const unbindFirst = relay.bind(first)
    relay.indicate({ ...sampleIndicator, value: "open" })
    unbindFirst()

    const second = fakeObserver()
    relay.bind(second)
    expect(second.indicators.at(-1)?.value).toBe("open")

    const spy = vi.spyOn(first, "emit")
    relay.emit(sampleEvent)
    expect(spy).not.toHaveBeenCalled()
    expect(second.events).toHaveLength(1)
  })

  it("reports active only while an observer is bound, gating detail retention", () => {
    const relay = createObserverRelay()
    expect(relay.active).toBe(false)
    const unbind = relay.bind(fakeObserver())
    expect(relay.active).toBe(true)
    unbind()
    expect(relay.active).toBe(false)
  })

  it("keeps a newer observer bound when an earlier connection unbinds late", () => {
    const relay = createObserverRelay()
    const first = fakeObserver()
    const second = fakeObserver()
    const unbindFirst = relay.bind(first)
    relay.bind(second)

    expect(unbindFirst()).toBe(false)
    relay.emit(sampleEvent)

    expect(relay.active).toBe(true)
    expect(first.events).toHaveLength(0)
    expect(second.events).toHaveLength(1)
  })

  it("isolates indicator replay failures and remains safely unbound", () => {
    const relay = createObserverRelay()
    relay.indicate(sampleIndicator)
    expect(() =>
      relay.bind({
        emit: () => {},
        indicate: () => {
          throw new Error("bridge down")
        },
        fail: () => {
          throw new Error("failure channel down")
        },
        recover: () => {},
      }),
    ).not.toThrow()

    expect(() => relay.emit(sampleEvent)).not.toThrow()
  })
})

describe("observeSafely", () => {
  it("runs the body and returns without touching the failure channel on success", () => {
    const relay = createObserverRelay()
    const observer = fakeObserver()
    relay.bind(observer)
    let ran = false
    observeSafely(relay, () => {
      ran = true
    })
    expect(ran).toBe(true)
    expect(observer.failures).toHaveLength(0)
  })

  it("swallows a body fault and routes it to the source's failure channel", () => {
    const relay = createObserverRelay()
    const observer = fakeObserver()
    relay.bind(observer)
    const boom = new Error("boom")
    expect(() =>
      observeSafely(relay, () => {
        throw boom
      }),
    ).not.toThrow()
    expect(observer.failures).toEqual([boom])
  })

  it("still swallows when the failure channel itself throws", () => {
    const relay = createObserverRelay()
    relay.bind({
      emit: () => {},
      indicate: () => {},
      fail: () => {
        throw new Error("failure channel down")
      },
      recover: () => {},
    })
    expect(() =>
      observeSafely(relay, () => {
        throw new Error("boom")
      }),
    ).not.toThrow()
  })
})
