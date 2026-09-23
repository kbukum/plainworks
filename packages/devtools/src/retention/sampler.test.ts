import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { SourceEvent } from "../protocol"
import { createEventSampler } from "./sampler"

function event(label: string, at = 0): SourceEvent {
  return { kind: "tick", label, severity: "info", at }
}

describe("createEventSampler", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])(
    "rejects an invalid interval of %s",
    (intervalMs) => {
      expect(() =>
        createEventSampler({
          intervalMs,
          mode: "coalesce",
          onEmit: () => {},
        }),
      ).toThrowError(RangeError)
    },
  )

  it("emits every event immediately when intervalMs is 0", () => {
    const emitted: string[] = []
    const sampler = createEventSampler({
      intervalMs: 0,
      mode: "coalesce",
      onEmit: (e) => emitted.push(e.label),
    })

    sampler.offer(event("a"))
    sampler.offer(event("b"))
    expect(emitted).toEqual(["a", "b"])
    sampler.dispose()
  })

  it("in sample mode emits the first event per window and drops the rest", () => {
    let nowMs = 1_000
    const emitted: string[] = []
    const sampler = createEventSampler({
      intervalMs: 100,
      mode: "sample",
      onEmit: (e) => emitted.push(e.label),
      now: () => nowMs,
    })

    sampler.offer(event("a"))
    sampler.offer(event("b"))
    expect(emitted).toEqual(["a"])

    nowMs = 1_100
    sampler.offer(event("c"))
    expect(emitted).toEqual(["a", "c"])

    // Sample mode holds nothing back, so flush and the timer never emit a trailing event.
    sampler.flush()
    vi.advanceTimersByTime(200)
    expect(emitted).toEqual(["a", "c"])
    sampler.dispose()
  })

  it("in coalesce mode emits the leading edge and releases the trailing event at the boundary", () => {
    let nowMs = 1_000
    const emitted: string[] = []
    const sampler = createEventSampler({
      intervalMs: 250,
      mode: "coalesce",
      onEmit: (e) => emitted.push(e.label),
      now: () => nowMs,
    })

    sampler.offer(event("first"))
    expect(emitted).toEqual(["first"])

    nowMs = 1_050
    sampler.offer(event("second"))
    nowMs = 1_100
    sampler.offer(event("third"))
    expect(emitted).toEqual(["first"])

    nowMs = 1_250
    vi.advanceTimersByTime(200)
    expect(emitted).toEqual(["first", "third"])

    nowMs = 1_600
    sampler.offer(event("fourth"))
    expect(emitted).toEqual(["first", "third", "fourth"])
    sampler.dispose()
  })

  it("in coalesce mode flushes the held event immediately and the timer does not re-emit", () => {
    const nowMs = 1_000
    const emitted: string[] = []
    const sampler = createEventSampler({
      intervalMs: 250,
      mode: "coalesce",
      onEmit: (e) => emitted.push(e.label),
      now: () => nowMs,
    })

    sampler.offer(event("a"))
    sampler.offer(event("b"))
    expect(emitted).toEqual(["a"])

    sampler.flush()
    expect(emitted).toEqual(["a", "b"])

    vi.advanceTimersByTime(300)
    expect(emitted).toEqual(["a", "b"])
    sampler.dispose()
  })

  it("cancels a pending timer cleanly on dispose without leaking or emitting", () => {
    const nowMs = 1_000
    const emitted: string[] = []
    const sampler = createEventSampler({
      intervalMs: 250,
      mode: "coalesce",
      onEmit: (e) => emitted.push(e.label),
      now: () => nowMs,
    })

    sampler.offer(event("a"))
    sampler.offer(event("b"))
    expect(emitted).toEqual(["a"])

    sampler.dispose()
    vi.advanceTimersByTime(300)
    expect(emitted).toEqual(["a"])
  })

  it("routes a trailing timer clock failure without throwing asynchronously", () => {
    let clockCalls = 0
    const failures: unknown[] = []
    const sampler = createEventSampler({
      intervalMs: 250,
      mode: "coalesce",
      onEmit: () => {},
      onError: (error) => failures.push(error),
      now: () => {
        clockCalls += 1
        if (clockCalls > 2) throw new Error("clock failed")
        return 1_000
      },
    })

    sampler.offer(event("a"))
    sampler.offer(event("b"))
    expect(() => vi.advanceTimersByTime(250)).not.toThrow()
    expect(failures).toHaveLength(1)
    sampler.dispose()
  })
})
