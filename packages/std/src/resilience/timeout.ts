import { PlainError } from "../errors"

/**
 * A cancellable delay: resolve after `ms`, or reject with an {@link AbortError} if `signal` aborts first. Injected so retry/timeout logic is deterministic under test (a fake delay resolves instantly); production uses {@link systemDelay}.
 */
export type Delay = (ms: number, signal?: AbortSignal) => Promise<void>

/** Raised when an operation exceeds its per-attempt time budget. Retryable under the classifier. */
export class TimeoutError extends PlainError<"std/timeout"> {
  constructor(ms: number, options?: { cause?: unknown }) {
    super("std/timeout", `Operation timed out after ${ms}ms`, options)
  }
}

/** Raised when a caller/deadline `AbortSignal` cancels an operation. Fatal under the classifier. */
export class AbortError extends PlainError<"std/aborted"> {
  constructor(options?: { cause?: unknown }) {
    super("std/aborted", "Operation aborted", options)
  }
}

function toAbortError(signal: AbortSignal): AbortError {
  return new AbortError({ cause: signal.reason })
}

/** The host `setTimeout` ceiling: a 32-bit signed millisecond count. Above it, engines wrap the delay and fire near-immediately, turning a long budget into an instant one. */
const MAX_TIMER_MS = 2_147_483_647

/** Guard a duration before it reaches a host timer: reject a non-finite, negative, or overflowing value rather than let the engine silently coerce it. */
function assertTimerMs(ms: number): void {
  if (!Number.isFinite(ms) || ms < 0 || ms > MAX_TIMER_MS) {
    throw new RangeError(`Delay must be a finite number between 0 and ${MAX_TIMER_MS} ms`)
  }
}

/** The default {@link Delay}, backed by the host timer and cancellable via `signal`. */
export const systemDelay: Delay = (ms, signal) =>
  new Promise<void>((resolve, reject) => {
    assertTimerMs(ms)
    if (signal?.aborted) {
      reject(toAbortError(signal))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(toAbortError(signal as AbortSignal))
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })

/**
 * Combine several `AbortSignal`s into one that aborts as soon as any input does. Ignores `undefined` inputs; with none, returns a signal that never aborts. Built on the standard `AbortSignal.any`.
 */
export function combineSignals(...signals: ReadonlyArray<AbortSignal | undefined>): AbortSignal {
  const present = signals.filter((signal): signal is AbortSignal => signal !== undefined)
  if (present.length === 0) {
    return new AbortController().signal
  }
  const [only] = present
  if (present.length === 1 && only !== undefined) {
    return only
  }
  return AbortSignal.any(present)
}

/** A disposable deadline: the abort signal plus explicit teardown for the backing timer. */
export interface Deadline {
  /** Aborts with an {@link AbortError} once the deadline elapses — fatal under the classifier. */
  readonly signal: AbortSignal
  /** Clear the backing timer; the signal never fires after disposal. Idempotent. */
  dispose(): void
}

/**
 * Create a deadline that aborts after `ms` with an {@link AbortError} — a spent overall budget, which the shared classifier treats as **fatal** (once the budget is gone, do not retry). This is deliberately distinct from a per-attempt {@link withTimeout}, which raises a retryable {@link TimeoutError}. Call {@link Deadline.dispose} when the protected work finishes early so the timer never outlives it; the backing timer is also unref'd where the host supports it, so a pending deadline never keeps the process alive on its own.
 */
export function createDeadline(ms: number): Deadline {
  assertTimerMs(ms)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new AbortError()), ms)
  // `unref` is a Node timer affordance absent in browsers/workers; widen to `unknown` and feature-detect, because the ambient timer-handle type differs per consumer program (number, NodeJS.Timeout, or our opaque declaration).
  const handle: unknown = timer
  if (typeof handle === "object" && handle !== null && "unref" in handle) {
    const { unref } = handle
    if (typeof unref === "function") {
      unref.call(handle)
    }
  }
  let disposed = false
  return {
    signal: controller.signal,
    dispose: () => {
      if (disposed) {
        return
      }
      disposed = true
      clearTimeout(timer)
    },
  }
}

/**
 * Run `operation` under a time budget. It receives a signal that aborts on timeout **or** on the caller's `signal`, so a well-behaved operation (e.g. `fetch`) cancels its own work; if the budget elapses first the returned promise rejects with a retryable {@link TimeoutError}, while a caller abort rejects immediately with a fatal {@link AbortError} — even if the operation ignores cancellation. `delay` is injectable for deterministic tests. The timeout timer and the caller listener are always torn down once the call settles.
 */
export function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  ms: number,
  options?: { signal?: AbortSignal; delay?: Delay },
): Promise<T> {
  const delay = options?.delay ?? systemDelay
  const callerSignal = options?.signal
  const timeoutController = new AbortController()
  const operationSignal = combineSignals(callerSignal, timeoutController.signal)
  // Aborts the pending `delay` the moment the call settles, so no timer outlives it.
  const timerController = new AbortController()
  let settled = false

  return new Promise<T>((resolve, reject) => {
    // Enforce the same duration invariant `systemDelay`/`createDeadline` do, even under a custom `delay` that would otherwise accept a NaN/negative/overflowing budget and run the operation unbounded.
    try {
      assertTimerMs(ms)
    } catch (error) {
      reject(error)
      return
    }
    function settle(settleWith: () => void): void {
      if (settled) {
        return
      }
      settled = true
      callerSignal?.removeEventListener("abort", onCallerAbort)
      timerController.abort()
      settleWith()
    }
    function onCallerAbort(): void {
      // A caller abort is fatal, not a retryable timeout, and wins even over a pending operation.
      const error = toAbortError(callerSignal as AbortSignal)
      settle(() => {
        timeoutController.abort(error)
        reject(error)
      })
    }
    if (callerSignal?.aborted) {
      onCallerAbort()
      return
    }
    callerSignal?.addEventListener("abort", onCallerAbort, { once: true })

    // An injected `delay` may throw synchronously despite its Promise return type; route that through `settle` so the caller listener is always torn down.
    let delayPromise: Promise<void>
    try {
      delayPromise = delay(ms, timerController.signal)
    } catch (error) {
      settle(() => reject(error))
      return
    }

    delayPromise.then(
      () =>
        settle(() => {
          const error = new TimeoutError(ms)
          timeoutController.abort(error)
          reject(error)
        }),
      // The expected post-settle cancellation no-ops inside `settle`; a delay that fails while the operation is still pending cancels the operation and settles the outer promise.
      (error: unknown) =>
        settle(() => {
          timeoutController.abort(error)
          reject(error)
        }),
    )

    let result: Promise<T>
    try {
      result = operation(operationSignal)
    } catch (error) {
      // A synchronous throw gets the same cleanup as an async rejection so the timer never outlives the rejected call.
      settle(() => reject(error))
      return
    }
    result.then(
      (value) => settle(() => resolve(value)),
      (error: unknown) => settle(() => reject(error)),
    )
  })
}
