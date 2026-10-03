import { MethodOptions_IdempotencyLevel } from "@bufbuild/protobuf/wkt"
import {
  Code,
  ConnectError,
  type Interceptor,
  type StreamRequest,
  type UnaryRequest,
} from "@connectrpc/connect"
import type { RandomSource } from "@plainworks/std/random"
import {
  AbortError,
  combineSignals,
  type Delay,
  type RetryDeps,
  RetryError,
  type RetryPolicy,
  raceAbort,
  runWithRetry,
  systemDelay,
  TimeoutError,
  withTimeout,
} from "@plainworks/std/resilience"
import type { WebAbortController, WebAbortSignal } from "@plainworks/std/web"
import { connectRetryAfter, isConnectRetryable } from "./retry-classification"

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
   * Unary per-attempt deadline in ms. For streams, bounds header arrival, gaps between consumed
   * messages (including the first pull), and the separate cleanup wait.
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
 * re-consumed or bounded by a single request deadline, so it is not retried. Header arrival and
 * consumption gaps have independent timeout guards. Teardown starts on completion, error, caller
 * cancellation, or an early consumer break, with its own bounded wait.
 *
 * Place it **outermost** in the interceptor chain so the retry loop re-runs the whole chain — auth
 * injection included — on every attempt. On exhaustion or timeout the underlying `std`
 * `TimeoutError`/`AbortError` is remapped to a `ConnectError` (`deadline_exceeded`/`canceled`) so
 * the outer transport boundary can expose the shared RpcError contract.
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
        isRetryable: (error) => isConnectRetryable(error) && (retry.isRetryable?.(error) ?? true),
        retryAfter: (error) => {
          const minimum = connectRetryAfter(error)
          const custom = retry.retryAfter?.(error)
          return minimum === undefined
            ? custom
            : Math.max(
                minimum,
                custom !== undefined && Number.isFinite(custom) && custom >= 0 ? custom : 0,
              )
        },
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
  try {
    const response = await withTimeout(() => next({ ...request, signal }), timeoutMs, {
      ...(callerSignal === undefined ? {} : { signal: callerSignal }),
      ...(delay === undefined ? {} : { delay }),
    })
    if (!response.stream) {
      idleController.abort()
      return response
    }
    return {
      ...response,
      message: idleGuarded(response.message, timeoutMs, idleController, signal, delay),
    }
  } catch (error) {
    idleController.abort(error)
    throw toConnectError(error)
  }
}

/**
 * Start the idle clock at headers, not at the first pull. No messages are buffered; consumers
 * must pull within the idle budget. Cancellation releases listeners immediately, and teardown
 * gets its own bounded wait so an uncooperative iterator cannot hide the primary failure.
 */
function idleGuarded<T>(
  source: AsyncIterable<T>,
  idleMs: number,
  idleController: WebAbortController,
  signal: WebAbortSignal,
  delay: Delay | undefined,
): AsyncIterableIterator<T> {
  const wait = delay ?? systemDelay
  const iterator = source[Symbol.asyncIterator]()
  let timer = new AbortController()
  let closed = false
  let failure: unknown
  let cleanup: Promise<void> | undefined
  const close = (reason?: unknown): Promise<void> => {
    if (closed) return cleanup ?? Promise.resolve()
    closed = true
    failure = reason
    timer.abort()
    signal.removeEventListener("abort", onAbort)
    idleController.abort(reason)
    cleanup = withTimeout(
      async () => {
        await iterator.return?.()
      },
      idleMs,
      delay === undefined ? {} : { delay },
    ).catch((error: unknown) => {
      // Retain cleanup faults for the next observation, without replacing a primary read failure.
      failure ??= error
    })
    return cleanup
  }
  const onAbort = (): void => {
    void close(new AbortError({ cause: signal.reason }))
  }
  const arm = (): void => {
    timer.abort()
    timer = new AbortController()
    const current = timer
    void Promise.resolve()
      .then(() => wait(idleMs, current.signal))
      .then(
        () => {
          if (!current.signal.aborted) void close(new TimeoutError(idleMs))
        },
        (error: unknown) => {
          if (!current.signal.aborted) void close(error)
        },
      )
  }
  signal.addEventListener("abort", onAbort, { once: true })
  if (signal.aborted) onAbort()
  else arm()
  return {
    [Symbol.asyncIterator]() {
      return this
    },
    async next() {
      if (failure !== undefined) throw toConnectError(failure)
      if (closed) return { done: true, value: undefined }
      try {
        const result = await raceAbort(iterator.next(), signal)
        if (result.done) {
          await close()
          if (failure !== undefined) throw failure
        } else arm()
        return result
      } catch (error) {
        void close(error)
        throw toConnectError(failure ?? error)
      }
    },
    async return() {
      await close()
      if (failure !== undefined) throw toConnectError(failure)
      return { done: true, value: undefined }
    },
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
