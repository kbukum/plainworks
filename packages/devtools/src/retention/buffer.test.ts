import { describe, expect, it } from "vitest"
import type { SourceEvent } from "../protocol"
import { createRetentionBuffer } from "./buffer"

const id = { kind: "http", instance: "api" }
const other = { kind: "state", instance: "cart" }

function event(label: string): SourceEvent {
  return { kind: "request", label, severity: "ok", at: 0 }
}

describe("createRetentionBuffer", () => {
  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY])(
    "rejects an invalid capacity of %s",
    (capacity) => {
      expect(() => createRetentionBuffer({ perSource: capacity, aggregate: 10 })).toThrowError(
        RangeError,
      )
      expect(() => createRetentionBuffer({ perSource: 10, aggregate: capacity })).toThrowError(
        RangeError,
      )
    },
  )

  it("retains events per source and in aggregate order", () => {
    const buffer = createRetentionBuffer({ perSource: 10, aggregate: 10 })
    buffer.push({ id, seq: 1, event: event("a") })
    buffer.push({ id: other, seq: 1, event: event("b") })
    buffer.push({ id, seq: 2, event: event("c") })

    expect(buffer.aggregate().map((e) => e.event.label)).toEqual(["a", "b", "c"])
    expect(buffer.perSource(id).map((e) => e.event.label)).toEqual(["a", "c"])
    expect(buffer.perSource(other).map((e) => e.event.label)).toEqual(["b"])
  })

  it("drops oldest per source beyond capacity and counts the loss", () => {
    const buffer = createRetentionBuffer({ perSource: 2, aggregate: 10 })
    buffer.push({ id, seq: 1, event: event("a") })
    buffer.push({ id, seq: 2, event: event("b") })
    buffer.push({ id, seq: 3, event: event("c") })

    expect(buffer.perSource(id).map((e) => e.seq)).toEqual([2, 3])
    expect(buffer.droppedForSource(id)).toBe(1)
  })

  it("drops oldest in aggregate beyond capacity and counts the loss", () => {
    const buffer = createRetentionBuffer({ perSource: 10, aggregate: 2 })
    buffer.push({ id, seq: 1, event: event("a") })
    buffer.push({ id, seq: 2, event: event("b") })
    buffer.push({ id, seq: 3, event: event("c") })

    expect(buffer.aggregate().map((e) => e.event.label)).toEqual(["b", "c"])
    expect(buffer.droppedAggregate()).toBe(1)
  })

  it("forgets a source from both retention views without touching others", () => {
    const buffer = createRetentionBuffer({ perSource: 10, aggregate: 10 })
    buffer.push({ id, seq: 1, event: event("a") })
    buffer.push({ id: other, seq: 1, event: event("b") })
    buffer.forget(id)

    expect(buffer.perSource(id)).toEqual([])
    expect(buffer.perSource(other).map((e) => e.event.label)).toEqual(["b"])
    expect(buffer.aggregate().map((e) => e.event.label)).toEqual(["b"])
  })

  it("clears all history and drop counters", () => {
    const buffer = createRetentionBuffer({ perSource: 1, aggregate: 1 })
    buffer.push({ id, seq: 1, event: event("a") })
    buffer.push({ id, seq: 2, event: event("b") })
    buffer.clear()

    expect(buffer.aggregate()).toEqual([])
    expect(buffer.droppedAggregate()).toBe(0)
    expect(buffer.droppedForSource(id)).toBe(0)
  })
})
