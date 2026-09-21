import { afterEach, describe, expect, it, vi } from "vitest"
import { createLatency, MAX_LATENCY_MS } from "./latency"

describe("latency", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("is disabled by default and clamps negative values", async () => {
    const latency = createLatency()
    expect(latency.get()).toBe(0)
    await expect(latency.wait()).resolves.toBeUndefined()

    latency.set(-5)
    expect(latency.get()).toBe(0)
  })

  it("waits for the configured fixed latency", async () => {
    vi.useFakeTimers()
    const latency = createLatency(50)
    let done = false
    const pending = latency.wait().then(() => {
      done = true
    })
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(50)
    await pending
    expect(done).toBe(true)
  })

  it("honors an initial latency", () => {
    expect(createLatency(25).get()).toBe(25)
  })

  it("clamps latency to the platform timer range", () => {
    const latency = createLatency(MAX_LATENCY_MS + 1)
    expect(latency.get()).toBe(MAX_LATENCY_MS)

    latency.set(MAX_LATENCY_MS + 1)
    expect(latency.get()).toBe(MAX_LATENCY_MS)
  })

  it("rejects non-finite latency values", () => {
    expect(() => createLatency(Number.NaN)).toThrow(RangeError)
    expect(() => createLatency(Number.POSITIVE_INFINITY)).toThrow(RangeError)
    const latency = createLatency()
    expect(() => latency.set(Number.NaN)).toThrow(RangeError)
    expect(() => latency.set(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })

  it("an aborted signal skips the wait and clears the timer", async () => {
    vi.useFakeTimers()
    const latency = createLatency(1000)
    const controller = new AbortController()
    const pending = latency.wait(controller.signal)
    controller.abort()
    await pending // resolves without advancing the clock
  })
})
