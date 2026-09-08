import { expect, test, vi } from "vitest"
import type { WebAbortSignal } from "../web"
import {
  AbortError,
  combineSignals,
  createDeadline,
  type Delay,
  raceAbort,
  systemDelay,
  TimeoutError,
  withTimeout,
} from "./timeout"

/** A delay whose pending timers the test settles by hand — no real time passes. */
function controllableDelay() {
  const calls: Array<{ ms: number; signal: WebAbortSignal | undefined; fire: () => void }> = []
  const delay: Delay = (ms, signal) =>
    new Promise<void>((resolve, reject) => {
      calls.push({ ms, signal, fire: resolve })
      signal?.addEventListener("abort", () => reject(new AbortError()), { once: true })
    })
  return { delay, calls }
}

test("withTimeout rejects with a TimeoutError and aborts the operation when the budget elapses", async () => {
  const { delay, calls } = controllableDelay()
  let operationSignal: WebAbortSignal | undefined
  const promise = withTimeout(
    (signal) => {
      operationSignal = signal
      return new Promise<never>(() => {})
    },
    100,
    { delay },
  )
  calls[0]?.fire()
  await expect(promise).rejects.toBeInstanceOf(TimeoutError)
  expect(operationSignal?.aborted).toBe(true)
})

test("withTimeout resolves the operation's value and cancels the timer", async () => {
  const { delay, calls } = controllableDelay()
  await expect(withTimeout(async () => "done", 100, { delay })).resolves.toBe("done")
  expect(calls[0]?.signal?.aborted).toBe(true)
})

test("withTimeout applies settle cleanup when the operation throws synchronously", async () => {
  const { delay, calls } = controllableDelay()
  await expect(
    withTimeout(
      () => {
        throw new Error("sync boom")
      },
      100,
      { delay },
    ),
  ).rejects.toThrow("sync boom")
  expect(calls[0]?.signal?.aborted).toBe(true)
})

test("withTimeout rejects and cancels the operation when the delay fails before settle", async () => {
  const failingDelay: Delay = async () => {
    throw new Error("timer broken")
  }
  let operationSignal: WebAbortSignal | undefined
  const promise = withTimeout(
    (signal) => {
      operationSignal = signal
      return new Promise<never>(() => {})
    },
    100,
    { delay: failingDelay },
  )
  await expect(promise).rejects.toThrow("timer broken")
  expect(operationSignal?.aborted).toBe(true)
})

test("withTimeout rejects with a fatal AbortError on caller abort, even if the operation never settles", async () => {
  const { delay } = controllableDelay()
  const controller = new AbortController()
  let operationSignal: WebAbortSignal | undefined
  const promise = withTimeout(
    (signal) => {
      operationSignal = signal
      return new Promise<never>(() => {})
    },
    100,
    { delay, signal: controller.signal },
  )
  controller.abort()
  await expect(promise).rejects.toBeInstanceOf(AbortError)
  expect(operationSignal?.aborted).toBe(true)
})

test("withTimeout rejects immediately when the caller signal is already aborted", async () => {
  const { delay } = controllableDelay()
  const controller = new AbortController()
  controller.abort()
  let ran = false
  await expect(
    withTimeout(
      async () => {
        ran = true
        return "unreached"
      },
      100,
      { delay, signal: controller.signal },
    ),
  ).rejects.toBeInstanceOf(AbortError)
  expect(ran).toBe(false)
})

test("withTimeout rejects an invalid budget before invoking the operation, even under a custom delay", async () => {
  const permissiveDelay: Delay = () => new Promise<void>(() => {})
  let ran = false
  await expect(
    withTimeout(
      async () => {
        ran = true
        return "unreached"
      },
      Number.NaN,
      { delay: permissiveDelay },
    ),
  ).rejects.toBeInstanceOf(RangeError)
  expect(ran).toBe(false)
})

test("systemDelay resolves after the interval and rejects on abort", async () => {
  vi.useFakeTimers()
  try {
    const resolved = systemDelay(1_000)
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(resolved).resolves.toBeUndefined()

    const controller = new AbortController()
    const pending = systemDelay(1_000, controller.signal)
    controller.abort()
    await expect(pending).rejects.toBeInstanceOf(AbortError)
  } finally {
    vi.useRealTimers()
  }
})

test("systemDelay rejects a non-finite, negative, or overflowing duration", async () => {
  await expect(systemDelay(Number.NaN)).rejects.toBeInstanceOf(RangeError)
  await expect(systemDelay(-1)).rejects.toBeInstanceOf(RangeError)
  await expect(systemDelay(Number.POSITIVE_INFINITY)).rejects.toBeInstanceOf(RangeError)
  await expect(systemDelay(2_147_483_648)).rejects.toBeInstanceOf(RangeError)
})

test("createDeadline rejects an unsupported duration instead of coercing the host timer", () => {
  expect(() => createDeadline(Number.NaN)).toThrow(RangeError)
  expect(() => createDeadline(-1)).toThrow(RangeError)
  expect(() => createDeadline(2_147_483_648)).toThrow(RangeError)
})

test("withTimeout routes a synchronously-throwing delay through settle cleanup", async () => {
  const controller = new AbortController()
  const throwingDelay: Delay = () => {
    throw new Error("timer exploded")
  }
  await expect(
    withTimeout(() => new Promise<never>(() => {}), 100, {
      delay: throwingDelay,
      signal: controller.signal,
    }),
  ).rejects.toThrow("timer exploded")
  // The caller listener was torn down on settle, so a later abort is inert (no unhandled rejection).
  controller.abort()
})

test("combineSignals aborts when any input aborts", () => {
  const a = new AbortController()
  const b = new AbortController()
  const combined = combineSignals(a.signal, undefined, b.signal)
  expect(combined.aborted).toBe(false)
  b.abort()
  expect(combined.aborted).toBe(true)
})

test("combineSignals passes a lone signal through and never aborts with none", () => {
  const only = new AbortController().signal
  expect(combineSignals(only, undefined)).toBe(only)
  expect(combineSignals().aborted).toBe(false)
})

test("combineSignals forwards the reason of the first input to abort", () => {
  const a = new AbortController()
  const b = new AbortController()
  const combined = combineSignals(a.signal, b.signal)
  b.abort(new Error("b failed"))
  expect(combined.aborted).toBe(true)
  expect(combined.reason).toBeInstanceOf(Error)
  expect((combined.reason as Error).message).toBe("b failed")
})

test("combineSignals aborts immediately when an input is already aborted", () => {
  const already = new AbortController()
  already.abort(new Error("pre"))
  const live = new AbortController()
  const combined = combineSignals(live.signal, already.signal)
  expect(combined.aborted).toBe(true)
  expect((combined.reason as Error).message).toBe("pre")
})

test("createDeadline aborts with a fatal AbortError after its interval", async () => {
  vi.useFakeTimers()
  try {
    const deadline = createDeadline(1_000)
    expect(deadline.signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(deadline.signal.aborted).toBe(true)
    expect(deadline.signal.reason).toBeInstanceOf(AbortError)
    deadline.dispose()
  } finally {
    vi.useRealTimers()
  }
})

test("a disposed deadline never fires", async () => {
  vi.useFakeTimers()
  try {
    const deadline = createDeadline(1_000)
    deadline.dispose()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(deadline.signal.aborted).toBe(false)
  } finally {
    vi.useRealTimers()
  }
})

test("withTimeout leaves no listener on a long-lived caller signal after a normal completion", async () => {
  // A counting signal proxies a real controller but records every add/remove so the test can assert
  // the combined-signal plumbing (withTimeout + combineSignals) fully detaches on success.
  const inner = new AbortController()
  const live = new Set<() => void>()
  let everAdded = 0
  const callerSignal: WebAbortSignal = {
    get aborted() {
      return inner.signal.aborted
    },
    get reason() {
      return inner.signal.reason
    },
    throwIfAborted() {
      inner.signal.throwIfAborted()
    },
    addEventListener(_type, listener) {
      everAdded++
      live.add(listener)
      inner.signal.addEventListener("abort", listener, { once: true })
    },
    removeEventListener(_type, listener) {
      live.delete(listener)
      inner.signal.removeEventListener("abort", listener)
    },
  }

  const { delay } = controllableDelay()
  const value = await withTimeout(async () => "ok", 100, { signal: callerSignal, delay })

  expect(value).toBe("ok")
  expect(everAdded).toBeGreaterThan(0)
  expect(live.size).toBe(0)
})

test("raceAbort resolves with the promise value when it settles before any abort", async () => {
  const controller = new AbortController()
  const value = await raceAbort(Promise.resolve("done"), controller.signal)
  expect(value).toBe("done")
})

test("raceAbort forwards the promise's own rejection unchanged", async () => {
  const controller = new AbortController()
  const boom = new Error("boom")
  await expect(raceAbort(Promise.reject(boom), controller.signal)).rejects.toBe(boom)
})

test("raceAbort rejects with an AbortError the moment the signal aborts, without cancelling the promise", async () => {
  const controller = new AbortController()
  let settled = false
  const pending = new Promise<string>((resolve) => {
    setTimeout(() => {
      settled = true
      resolve("late")
    }, 0)
  })
  const race = raceAbort(pending, controller.signal)
  controller.abort()
  await expect(race).rejects.toBeInstanceOf(AbortError)
  // The underlying promise is untouched — it still settles for its other awaiters.
  await expect(pending).resolves.toBe("late")
  expect(settled).toBe(true)
})

test("raceAbort rejects immediately for an already-aborted signal", async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(raceAbort(Promise.resolve("unused"), controller.signal)).rejects.toBeInstanceOf(
    AbortError,
  )
})

test("raceAbort returns the promise unchanged when no signal is supplied", async () => {
  const promise = Promise.resolve("passthrough")
  expect(raceAbort(promise)).toBe(promise)
})

test("raceAbort removes its abort listener once the promise settles", async () => {
  const controller = new AbortController()
  const removeSpy = vi.spyOn(controller.signal, "removeEventListener")
  await raceAbort(Promise.resolve("ok"), controller.signal)
  expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function))
})
