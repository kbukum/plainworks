import { AbortError, type WebAbortSignal } from "@plainworks/std"
import { describe, expect, test } from "vitest"
import { manualDelay } from "./delay"

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
