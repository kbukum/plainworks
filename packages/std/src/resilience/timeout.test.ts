import { expect, test, vi } from "vitest"
import {
  AbortError,
  combineSignals,
  createDeadline,
  type Delay,
  systemDelay,
  TimeoutError,
  withTimeout,
} from "./timeout"

/** A delay whose pending timers the test settles by hand — no real time passes. */
function controllableDelay() {
  const calls: Array<{ ms: number; signal: AbortSignal | undefined; fire: () => void }> = []
  const delay: Delay = (ms, signal) =>
    new Promise<void>((resolve, reject) => {
      calls.push({ ms, signal, fire: resolve })
      signal?.addEventListener("abort", () => reject(new AbortError()), { once: true })
    })
  return { delay, calls }
}

test("withTimeout rejects with a TimeoutError and aborts the operation when the budget elapses", async () => {
  const { delay, calls } = controllableDelay()
  let operationSignal: AbortSignal | undefined
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
  let operationSignal: AbortSignal | undefined
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
  let operationSignal: AbortSignal | undefined
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
