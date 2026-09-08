import { MethodOptions_IdempotencyLevel } from "@bufbuild/protobuf/wkt"
import {
  Code,
  ConnectError,
  type Interceptor,
  type StreamRequest,
  type UnaryRequest,
} from "@connectrpc/connect"
import {
  AbortError,
  combineSignals,
  type Delay,
  type RandomSource,
  type RetryDeps,
  RetryError,
  type RetryPolicy,
  runWithRetry,
  systemDelay,
  TimeoutError,
  type WebAbortController,
  type WebAbortSignal,
  withTimeout,
} from "@plainworks/std"
import { isConnectRetryable } from "./classify"

/**
 * Retry configuration for the resilience interceptor — a `std` {@link RetryPolicy} **minus**
 * `idempotent`. Idempotency is not a caller choice here: it is derived per call from the method's
 * proto-declared idempotency level (`NO_SIDE_EFFECTS`/`IDEMPOTENT`), so a non-idempotent write is
 * never retried automatically.
 */
export type ConnectRetryPolicy = Omit<RetryPolicy, "idempotent">

/** Options for {@link resilienceInterceptor}. */
export interface ConnectResilienceOptions {
  /**
   * Time budget in ms. For a unary call it is the per-attempt deadline; for a streaming call it is
   * the **idle timeout** between messages — a gap longer than this fails the stream
   * `deadline_exceeded`.
   */
  readonly timeoutMs: number
  /** Retry policy; when omitted, each call makes a single (still timeout-bounded) attempt. */
  readonly retry?: ConnectRetryPolicy
  /** Injectable delay for deterministic timeout/backoff tests; defaults to the host timer. */
  readonly delay?: Delay
  /** Injectable jitter source for deterministic retry tests; defaults to the system RNG. */
  readonly random?: RandomSource
}

/**
 * The transport-level resilience seam, built entirely on `std` primitives so connect forks no
 * retry/timeout logic of its own. It wraps each **unary** call in a per-attempt {@link withTimeout}
 * budget and, when a {@link ConnectResilienceOptions.retry} policy is set, drives idempotent-only
 * retries with bounded jittered backoff via {@link runWithRetry}. A **streaming** call cannot be
 * re-consumed or bounded by a single request deadline, so it is not retried; instead its output is
 * bounded by an **idle timeout** — if the server sends no message for `timeoutMs`, the underlying
 * stream is aborted and the call fails `deadline_exceeded`, so a stalled stream never stays open
 * indefinitely. Teardown (the source iterator's `return`) always runs on completion, error, or an
 * early consumer `break`.
 *
 * Place it **outermost** in the interceptor chain so the retry loop re-runs the whole chain — auth
 * injection included — on every attempt. On exhaustion or timeout the underlying `std`
 * `TimeoutError`/`AbortError` is remapped to a `ConnectError` (`deadline_exceeded`/`canceled`) so
 * the consumer keeps a single Connect error contract to map with `mapConnectError`.
 */
export function resilienceInterceptor(options: ConnectResilienceOptions): Interceptor {
  const { timeoutMs, retry, delay, random } = options
  return (next) => async (request) => {
    const callerSignal: WebAbortSignal | undefined = request.signal

    if (request.stream) {
      return streamWithIdleTimeout(request, next, timeoutMs, callerSignal, delay)
    }

    const attempt = (signal: WebAbortSignal | undefined) => {
      const timeoutOptions: { signal?: WebAbortSignal; delay?: Delay } = {
        ...(signal !== undefined ? { signal } : {}),
        ...(delay !== undefined ? { delay } : {}),
      }
      return withTimeout(
        (timeoutSignal) => next({ ...request, signal: timeoutSignal }),
        timeoutMs,
        timeoutOptions,
      )
    }

    try {
      if (retry === undefined) {
        return await attempt(callerSignal)
      }
      const policy: RetryPolicy = {
        ...retry,
        idempotent: isMethodIdempotent(request),
        isRetryable: retry.isRetryable ?? isConnectRetryable,
      }
      const deps: RetryDeps = {
        ...(delay !== undefined ? { delay } : {}),
        ...(random !== undefined ? { random } : {}),
        ...(callerSignal !== undefined ? { signal: callerSignal } : {}),
      }
      return await runWithRetry((_attempt, signal) => attempt(signal), policy, deps)
    } catch (error) {
      throw toConnectError(error)
    }
  }
}

/** The `next` half of a Connect {@link Interceptor}: the wrapped call invocation. */
type NextFn = ReturnType<Interceptor>

/**
 * Bound a streaming call by an **idle timeout**: run it under a signal that combines the caller's
 * and an internal one, then wrap the output so each awaited message races a `timeoutMs` timer.
 * A message resets the timer; if the timer wins, the internal signal is aborted (cancelling the
 * underlying stream) and the call fails `deadline_exceeded`. The source iterator's `return` always
 * runs on exit, so nothing is left dangling on completion, error, or an early consumer `break`.
 */
async function streamWithIdleTimeout(
  request: StreamRequest,
  next: NextFn,
  timeoutMs: number,
  callerSignal: WebAbortSignal | undefined,
  delay: Delay | undefined,
): Promise<Awaited<ReturnType<NextFn>>> {
  const idleController = new AbortController()
  const signal = combineSignals(callerSignal, idleController.signal)
  const response = await next({ ...request, signal })
  if (!response.stream) {
    return response
  }
  return { ...response, message: idleGuarded(response.message, timeoutMs, idleController, delay) }
}

/**
 * Wrap a stream so a gap longer than `idleMs` between messages fails the call. The idle timer is
 * torn down the moment a message arrives (or the call ends); on a stall it aborts `idleController`
 * to cancel the underlying transport, then throws `deadline_exceeded`. On exit the source
 * iterator's `return` runs and `idleController` is disposed even when `return` throws —
 * `combineSignals` only unlinks its listeners once the combined signal aborts, so a completed
 * stream must never retain listeners on a long-lived caller signal.
 */
async function* idleGuarded<T>(
  source: AsyncIterable<T>,
  idleMs: number,
  idleController: WebAbortController,
  delay: Delay | undefined,
): AsyncIterable<T> {
  const wait = delay ?? systemDelay
  const iterator = source[Symbol.asyncIterator]()
  try {
    for (;;) {
      const timer = new AbortController()
      let idled = false
      const idle = wait(idleMs, timer.signal).then(
        () => {
          idled = true
        },
        (reason: unknown) => {
          // Swallow only our own post-message cancellation; a real delay failure (e.g. a
          // RangeError for an invalid timeoutMs) must win the race instead of leaving the
          // stream waiting on `nextResult` forever.
          if (timer.signal.aborted) {
            return
          }
          throw reason
        },
      )
      const nextResult = iterator.next()
      // The timer must die on every outcome of the race — a message, a stall, or a rejected read
      // (e.g. caller cancellation) — so no iteration leaves an idle delay running past stream end.
      try {
        await Promise.race([nextResult, idle])
      } finally {
        timer.abort()
      }
      if (idled) {
        idleController.abort(new AbortError())
        // The in-flight read will reject once the stream is cancelled; drain it so that rejection
        // is never unhandled.
        void nextResult.catch(() => {})
        throw new ConnectError(
          `stream stalled: no message within ${idleMs}ms`,
          Code.DeadlineExceeded,
        )
      }
      const result = await nextResult
      if (result.done === true) {
        return
      }
      yield result.value
    }
  } finally {
    try {
      await iterator.return?.()
    } finally {
      // Release the combined signal's listeners on the (possibly long-lived) caller signal:
      // `combineSignals` unlinks them only when the combined signal aborts.
      idleController.abort()
    }
  }
}

/** A method is retry-eligible only when its proto declares it side-effect-free or idempotent. */
function isMethodIdempotent(request: UnaryRequest): boolean {
  const level = request.method.idempotency
  return (
    level === MethodOptions_IdempotencyLevel.NO_SIDE_EFFECTS ||
    level === MethodOptions_IdempotencyLevel.IDEMPOTENT
  )
}

/**
 * Remap a `std` resilience failure onto the Connect error contract so the consumer only ever maps a
 * `ConnectError`: a retry-exhausted wrapper unwraps to its underlying cause (a `ConnectError` on a
 * server failure, or a `std` error on a timeout), a per-attempt `TimeoutError` becomes
 * `deadline_exceeded`, and a caller `AbortError` becomes `canceled`. A `ConnectError` (or anything
 * else) passes through unchanged.
 */
function toConnectError(error: unknown): unknown {
  if (error instanceof RetryError) {
    return toConnectError(error.cause)
  }
  if (error instanceof TimeoutError) {
    return new ConnectError(error.message, Code.DeadlineExceeded, undefined, undefined, error)
  }
  if (error instanceof AbortError) {
    return new ConnectError(error.message, Code.Canceled, undefined, undefined, error)
  }
  return error
}
