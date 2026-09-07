import { AbortError, type WebAbortSignal } from "@plainworks/std"
import { describe, expect, test } from "vitest"
import { autoBackoffDelay, manualDelay } from "./delay"

describe("manualDelay", () => {
  test("a wait stays pending until fired, then resolves", async () => {
    const clock = manualDelay()
    let resolved = false
    const promise = clock.delay(1000).then(() => {
      resolved = true
    })
    expect(clock.pending).toHaveLength(1)
    expect(resolved).toBe(false)
    clock.fireNext()
    await promise
    expect(resolved).toBe(true)
    expect(clock.pending).toHaveLength(0)
  })

  test("records every requested duration for backoff assertions", () => {
    const clock = manualDelay()
    void clock.delay(10)
    void clock.delay(20)
    expect(clock.waits).toEqual([10, 20])
  })

  test("fireWhere fires only matching waits", async () => {
    const clock = manualDelay()
    const small = clock.delay(50)
    void clock.delay(30_000)
    expect(clock.fireWhere((ms) => ms < 1000)).toBe(1)
    await small
    expect(clock.pending).toHaveLength(1)
    expect(clock.pending[0]?.ms).toBe(30_000)
  })

  test("a wait rejects with AbortError when its signal aborts and leaves the queue", async () => {
    const clock = manualDelay()
    const controller = new AbortController()
    const promise = clock.delay(1000, controller.signal)
    controller.abort(new Error("stop"))
    await expect(promise).rejects.toBeInstanceOf(AbortError)
    expect(clock.pending).toHaveLength(0)
  })

  test("an already-aborted signal rejects immediately", async () => {
    const clock = manualDelay()
    const controller = new AbortController()
    controller.abort()
    await expect(clock.delay(1000, controller.signal)).rejects.toBeInstanceOf(AbortError)
  })

  test("fireNext returns false when nothing is pending", () => {
    expect(manualDelay().fireNext()).toBe(false)
  })

  test("firing a wait removes its abort listener from the signal", async () => {
    const clock = manualDelay()
    const controller = new AbortController()
    let added = 0
    let removed = 0
    const real = controller.signal
    // A counting wrapper around the real signal, so listener teardown is observable.
    const signal: WebAbortSignal = {
      get aborted() {
        return real.aborted
      },
      get reason() {
        return real.reason
      },
      throwIfAborted: () => real.throwIfAborted(),
      addEventListener: (type, listener, options) => {
        added++
        real.addEventListener(type, listener, options)
      },
      removeEventListener: (type, listener) => {
        removed++
        real.removeEventListener(type, listener)
      },
    }

    const promise = clock.delay(1000, signal)
    expect(added).toBe(1)
    clock.fireNext()
    await promise
    expect(removed).toBe(1)
  })
})

describe("autoBackoffDelay", () => {
  test("a backoff wait resolves instantly and is recorded", async () => {
    const timer = autoBackoffDelay()
    await timer.delay(50)
    await timer.delay(120)
    expect(timer.waits).toEqual([50, 120])
  })

  test("a wait at or above the threshold stays pending until its signal aborts", async () => {
    const timer = autoBackoffDelay(10_000)
    const controller = new AbortController()
    let settled = false
    const promise = timer.delay(30_000, controller.signal).catch(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    // The long timeout wait is never counted as backoff.
    expect(timer.waits).toEqual([])
    controller.abort(new Error("stop"))
    await promise
    expect(settled).toBe(true)
  })

  test("a suspended wait rejects with the shared AbortError", async () => {
    const timer = autoBackoffDelay(10_000)
    const controller = new AbortController()
    const promise = timer.delay(30_000, controller.signal)
    controller.abort()
    await expect(promise).rejects.toBeInstanceOf(AbortError)
  })

  test("an already-aborted signal rejects a short wait immediately", async () => {
    const timer = autoBackoffDelay(10_000)
    const controller = new AbortController()
    controller.abort()
    await expect(timer.delay(50, controller.signal)).rejects.toBeInstanceOf(AbortError)
    expect(timer.waits).toEqual([])
  })

  test("an already-aborted signal rejects a suspended wait instead of hanging", async () => {
    const timer = autoBackoffDelay(10_000)
    const controller = new AbortController()
    controller.abort()
    await expect(timer.delay(30_000, controller.signal)).rejects.toBeInstanceOf(AbortError)
  })
})
