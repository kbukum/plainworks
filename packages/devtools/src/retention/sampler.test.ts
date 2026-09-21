import { manualClock } from "@plainworks/testkit"
import { describe, expect, it } from "vitest"
import type { SourceEvent } from "../protocol"
import { createEventSampler } from "./sampler"

function event(label: string): SourceEvent {
  return { kind: "tick", label, severity: "info", at: 0 }
}

describe("createEventSampler", () => {
  it("in sample mode emits the first event per window and drops the rest", () => {
    const clock = manualClock()
    const sampler = createEventSampler({ clock, intervalMs: 100, mode: "sample" })

    expect(sampler.offer(event("a"))?.label).toBe("a")
    expect(sampler.offer(event("b"))).toBe(null)
    clock.advance(100)
    expect(sampler.offer(event("c"))?.label).toBe("c")
    expect(sampler.flush()).toBe(null)
  })

  it("in coalesce mode keeps the latest event within a window", () => {
    const clock = manualClock()
    const sampler = createEventSampler({ clock, intervalMs: 100, mode: "coalesce" })

    expect(sampler.offer(event("a"))?.label).toBe("a")
    expect(sampler.offer(event("b"))).toBe(null)
    expect(sampler.offer(event("c"))).toBe(null)
    clock.advance(100)
    expect(sampler.offer(event("d"))?.label).toBe("c")
    expect(sampler.flush()?.label).toBe("d")
    expect(sampler.flush()).toBe(null)
  })
})
