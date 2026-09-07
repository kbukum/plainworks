import { expect, test } from "vitest"
import { createSeededRandom } from "../random"
import type { WebAbortSignal } from "../web"
import { NetworkError } from "./classify"
import { RetryError, type RetryPolicy, runWithRetry } from "./retry"
import type { Delay } from "./timeout"
import { AbortError } from "./timeout"

const backoff = { baseMs: 10, maxMs: 100, factor: 2, jitter: "none" } as const
const idempotent: RetryPolicy = { maxAttempts: 3, backoff, idempotent: true }

/** A delay that records requested waits and never actually sleeps. */
function recordingDelay() {
  const waits: number[] = []
  const delay: Delay = async (ms) => {
    waits.push(ms)
  }
  return { delay, waits }
}

const retryable = () => new NetworkError("Failed to fetch")

test("retries an idempotent operation on a retryable failure, then succeeds", async () => {
  const { delay, waits } = recordingDelay()
  let attempts = 0
  const value = await runWithRetry(
    async () => {
      attempts++
      if (attempts < 3) {
        throw retryable()
      }
      return "ok"
    },
    idempotent,
    { delay, random: createSeededRandom(1) },
  )
  expect(value).toBe("ok")
  expect(attempts).toBe(3)
  expect(waits).toEqual([10, 20])
})

test("does not retry a fatal (non-retryable) failure", async () => {
  const { delay } = recordingDelay()
  let attempts = 0
  await expect(
    runWithRetry(
      async () => {
        attempts++
        throw new Error("fatal")
      },
      idempotent,
      { delay },
    ),
  ).rejects.toThrow("fatal")
  expect(attempts).toBe(1)
})

test("never retries a non-idempotent operation", async () => {
  const { delay } = recordingDelay()
  let attempts = 0
  await expect(
    runWithRetry(
      async () => {
        attempts++
        throw retryable()
      },
      { maxAttempts: 5, backoff, idempotent: false },
      { delay },
    ),
  ).rejects.toBeInstanceOf(NetworkError)
  expect(attempts).toBe(1)
})

test("throws RetryError preserving the last cause once attempts are exhausted", async () => {
  const { delay } = recordingDelay()
  const last = retryable()
  let attempts = 0
  const error = await runWithRetry(
    async () => {
      attempts++
      throw last
    },
    idempotent,
    { delay },
  ).catch((thrown: unknown) => thrown)
  expect(error).toBeInstanceOf(RetryError)
  expect((error as RetryError).attempts).toBe(3)
  expect((error as RetryError).cause).toBe(last)
  expect(attempts).toBe(3)
})

test("honors a retryAfter hint over the backoff schedule", async () => {
  const { delay, waits } = recordingDelay()
  let attempts = 0
  await runWithRetry(
    async () => {
      attempts++
      if (attempts < 2) {
        throw retryable()
      }
      return "ok"
    },
    { ...idempotent, retryAfter: () => 50 },
    { delay },
  )
  expect(waits).toEqual([50])
})

test("clamps a retryAfter hint to the backoff maxMs", async () => {
  const { delay, waits } = recordingDelay()
  let attempts = 0
  await runWithRetry(
    async () => {
      attempts++
      if (attempts < 2) {
        throw retryable()
      }
      return "ok"
    },
    { ...idempotent, retryAfter: () => 60_000 },
    { delay },
  )
  expect(waits).toEqual([100])
})

test("ignores an invalid retryAfter hint and falls back to the backoff schedule", async () => {
  const { delay, waits } = recordingDelay()
  let attempts = 0
  await runWithRetry(
    async () => {
      attempts++
      if (attempts < 2) {
        throw retryable()
      }
      return "ok"
    },
    { ...idempotent, retryAfter: () => Number.NaN },
    { delay },
  )
  expect(waits).toEqual([10])
})

test("rejects an invalid backoff policy even when a hint covers every wait", async () => {
  await expect(
    runWithRetry(
      async () => {
        throw retryable()
      },
      {
        maxAttempts: 2,
        backoff: { baseMs: -1, maxMs: 100, factor: 2, jitter: "none" },
        idempotent: true,
        retryAfter: () => 5,
      },
    ),
  ).rejects.toBeInstanceOf(RangeError)
})

test("evaluates isRetryable once per failure, including the final attempt", async () => {
  const { delay } = recordingDelay()
  let evaluations = 0
  await expect(
    runWithRetry(
      async () => {
        throw retryable()
      },
      {
        ...idempotent,
        isRetryable: () => {
          evaluations++
          return true
        },
      },
      { delay },
    ),
  ).rejects.toBeInstanceOf(RetryError)
  expect(evaluations).toBe(3)
})

test("a caller abort cancels an in-flight attempt and wins a late success", async () => {
  const controller = new AbortController()
  let released: (() => void) | undefined
  let receivedSignal: WebAbortSignal | undefined
  const pending = runWithRetry(
    async (_attempt, signal) => {
      receivedSignal = signal
      await new Promise<void>((resolve) => {
        released = resolve
      })
      return "late"
    },
    idempotent,
    { signal: controller.signal },
  )
  controller.abort()
  await expect(pending).rejects.toBeInstanceOf(AbortError)
  // A late resolution of the abandoned attempt must not override the abort.
  released?.()
  expect(receivedSignal?.aborted).toBe(true)
})

test("a caller abort during backoff stops the retry loop", async () => {
  const controller = new AbortController()
  controller.abort()
  const abortingDelay: Delay = async (_ms, signal) => {
    if (signal?.aborted) {
      throw new AbortError()
    }
  }
  await expect(
    runWithRetry(
      async () => {
        throw retryable()
      },
      idempotent,
      { delay: abortingDelay, signal: controller.signal },
    ),
  ).rejects.toBeInstanceOf(AbortError)
})

test("a synchronous throw in an attempt settles through cleanup with a caller signal present", async () => {
  const controller = new AbortController()
  let attempts = 0
  await expect(
    runWithRetry(
      () => {
        attempts++
        throw new Error("sync boom")
      },
      idempotent,
      { signal: controller.signal },
    ),
  ).rejects.toThrow("sync boom")
  expect(attempts).toBe(1)
  // The caller signal outlives the call; aborting it must not surface an unhandled rejection from a
  // leaked abort listener on an already-settled attempt.
  controller.abort()
})

test("rejects an invalid maxAttempts", async () => {
  await expect(
    runWithRetry(async () => "x", { maxAttempts: 0, backoff, idempotent: true }),
  ).rejects.toBeInstanceOf(RangeError)
})

test("a pre-aborted signal prevents the first attempt", async () => {
  const controller = new AbortController()
  controller.abort()
  let attempts = 0
  await expect(
    runWithRetry(
      async () => {
        attempts++
        return "ok"
      },
      idempotent,
      { signal: controller.signal },
    ),
  ).rejects.toBeInstanceOf(AbortError)
  expect(attempts).toBe(0)
})

test("an abort between backoff and the next attempt stops the loop", async () => {
  const controller = new AbortController()
  let attempts = 0
  const abortingDelay: Delay = async () => {
    controller.abort()
  }
  await expect(
    runWithRetry(
      async () => {
        attempts++
        throw retryable()
      },
      idempotent,
      { delay: abortingDelay, signal: controller.signal },
    ),
  ).rejects.toBeInstanceOf(AbortError)
  expect(attempts).toBe(1)
})
