import {
  AbortError,
  type AuthHeaderProvider,
  type AuthHeaders,
  type BackoffPolicy,
  type Clock,
  classifyStatus,
  combineSignals,
  type Delay,
  defaultBackoff,
  getErrorMessage,
  isRetryable,
  type Listener,
  type RandomSource,
  RetryError,
  runWithRetry,
  StatusError,
  type Subscription,
  systemClock,
  systemDelay,
  systemRandom,
  TimeoutError,
  type WebAbortController,
  type WebAbortSignal,
} from "@plainworks/std"
import { assertDurationMs } from "../duration"
import { ChannelError } from "../error"
import type { ChannelFrame, TransportFactory } from "../transport"
import type { ChannelStatus } from "./status"

const DEFAULT_CONNECT_TIMEOUT_MS = 30_000
const DEFAULT_MIN_UPTIME_MS = 1_000
const DEFAULT_MAX_RETRIES = 10

/** Construction options for {@link createChannel}. */
export interface ChannelOptions {
  /** The wire adapter (sse / ws / …). A factory so each connection attempt gets an isolated transport. */
  readonly transport: TransportFactory
  /** Header-only credential seam; its headers are attached to every (re)connection attempt. */
  readonly authProvider?: AuthHeaderProvider
  /** Static non-secret headers merged into every attempt (auth headers win on conflict). */
  readonly headers?: AuthHeaders
  /** Seed the `Last-Event-ID` for header-only resume of a known stream; explicit `undefined` starts (or restarts) with no cursor. */
  readonly lastEventId?: string | undefined
  /** Reconnect after a dropped stream. Default `true`. */
  readonly reconnect?: boolean
  /** Reconnection backoff schedule (from `std`). Default `defaultBackoff`. */
  readonly backoff?: BackoffPolicy
  /**
   * Ceiling on **consecutive** retries after a failed attempt before the channel gives up and
   * closes terminally. A stable connection resets the count, so this bounds a run of failures, not
   * the channel's lifetime. `0` disables retries (a single attempt per session). Default `10`.
   */
  readonly maxRetries?: number
  /** Time budget (ms) to establish each connection before aborting the attempt. Default 30s. */
  readonly connectTimeoutMs?: number
  /**
   * Optional idle-read timeout (ms): if no frame arrives within this window of an open stream,
   * abort and reconnect — catches a half-dead socket that never errors. Default disabled.
   */
  readonly idleTimeoutMs?: number
  /**
   * How long a connection must stay open to count as **stable**. Backoff resets only after a stable
   * open, so a connection that flaps (opens then drops immediately) escalates backoff instead of
   * hammering the server. Default 1s.
   */
  readonly minUptimeMs?: number
  /** Notified on every lifecycle transition. */
  readonly onStatusChange?: (status: ChannelStatus) => void
  /**
   * Notified in two cases: the channel closes terminally with a failure (a fatal error, or retry
   * exhaustion reported as `channel/closed` with the last failure as `cause`), and a non-terminal
   * channel listener throw (`channel/protocol`). Check `status`/the error `kind` to distinguish.
   */
  readonly onError?: (error: ChannelError) => void
  /** Injected clock for uptime measurement; defaults to the wall clock. */
  readonly clock?: Clock
  /** Injected RNG for deterministic backoff jitter; defaults to the system RNG. */
  readonly random?: RandomSource
  /** Injected delay for deterministic backoff/timeout timing; defaults to the host timer. */
  readonly delay?: Delay
}

/**
 * A transport-agnostic streaming connection: one logical stream whose lifetime is bounded by
 * {@link Channel.connect} and {@link Channel.close}. Reconnection, backoff, timeouts, and frame
 * dispatch live here; the wire differences live in the injected transport.
 */
export interface Channel {
  /** Open the stream (idempotent while already active or closed). */
  connect(): void
  /** Abort the stream and stop reconnecting (idempotent). */
  close(): void
  /** Subscribe to frames of one `type`. */
  on(type: string, listener: Listener<ChannelFrame>): Subscription
  /** Subscribe to every frame regardless of type. */
  onAny(listener: Listener<ChannelFrame>): Subscription
  /** Current lifecycle status. */
  readonly status: ChannelStatus
  /** Most recent event id seen — sent as `Last-Event-ID` on reconnect. */
  readonly lastEventId: string | undefined
}

/**
 * Create a {@link Channel} over a transport. The reconnect loop is driven by `std`'s retry engine —
 * classification (a `401`/`403` is fatal and stops the loop), bounded jittered backoff, and the
 * retry ceiling all come from `std`, so this package owns only the lifecycle and the stable-open
 * gating, never a private backoff copy. Never a module singleton — build one per stream.
 */
export function createChannel(options: ChannelOptions): Channel {
  const {
    transport: transportFactory,
    authProvider,
    headers: staticHeaders,
    reconnect = true,
    backoff = defaultBackoff,
    maxRetries = DEFAULT_MAX_RETRIES,
    connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
    idleTimeoutMs,
    minUptimeMs = DEFAULT_MIN_UPTIME_MS,
    onStatusChange,
    onError,
    clock = systemClock,
    random = systemRandom,
    delay = systemDelay,
  } = options

  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw ChannelError.config("maxRetries must be an integer >= 0")
  }
  assertDurationMs("connectTimeoutMs", connectTimeoutMs)
  assertDurationMs("minUptimeMs", minUptimeMs)
  if (idleTimeoutMs !== undefined) {
    assertDurationMs("idleTimeoutMs", idleTimeoutMs)
  }

  const typeListeners = new Map<string, Set<Listener<ChannelFrame>>>()
  const anyListeners = new Set<Listener<ChannelFrame>>()

  let status: ChannelStatus = "idle"
  let running = false
  let closed = false
  let attemptsStarted = 0
  let lastEventId = options.lastEventId
  let serverRetryMs: number | undefined
  let controller: WebAbortController | undefined

  /** Observers are untrusted callbacks: a throw must never interrupt lifecycle teardown. */
  const notifyError = (error: ChannelError): void => {
    try {
      onError?.(error)
    } catch {
      // No one left to report an observer's own failure to — the lifecycle must continue.
    }
  }

  const setStatus = (next: ChannelStatus): void => {
    if (status === next) {
      return
    }
    status = next
    try {
      onStatusChange?.(next)
    } catch (cause) {
      notifyError(ChannelError.protocol("a status listener threw", { cause }))
    }
  }

  /** Track the resume cursor; an empty id resets it (SSE `id:` with no value). */
  const trackEventId = (id: string): void => {
    lastEventId = id === "" ? undefined : id
  }

  const dispatch = (frame: ChannelFrame): void => {
    if (frame.id !== undefined) {
      trackEventId(frame.id)
    }
    if (frame.retry !== undefined) {
      serverRetryMs = frame.retry
    }
    const deliver = (listener: Listener<ChannelFrame>): void => {
      try {
        listener(frame)
      } catch (cause) {
        notifyError(ChannelError.protocol("a channel listener threw", { cause }))
      }
    }
    for (const listener of [...anyListeners]) {
      deliver(listener)
    }
    const set = typeListeners.get(frame.type)
    if (set !== undefined) {
      for (const listener of [...set]) {
        deliver(listener)
      }
    }
  }

  const buildHeaders = async (signal: WebAbortSignal): Promise<AuthHeaders> => {
    const headers: Record<string, string> = { ...staticHeaders }
    if (authProvider !== undefined) {
      const auth = await authProvider({ signal })
      if (auth) {
        Object.assign(headers, auth)
      }
    }
    return headers
  }

  /**
   * Arm a timeout via the injected delay; returns a canceller that stops it firing. The expected
   * cancellation is silent, but any other delay rejection fails the attempt via `onFailure` —
   * otherwise the attempt would keep running with its timeout disabled (matching `std`'s
   * `withTimeout`, where a broken timer fails the call).
   */
  const armTimeout = (
    ms: number,
    onElapse: () => void,
    onFailure: (error: unknown) => void,
  ): (() => void) => {
    const canceller = new AbortController()
    delay(ms, canceller.signal).then(onElapse, (error: unknown) => {
      if (!canceller.signal.aborted) {
        onFailure(error)
      }
    })
    return () => canceller.abort()
  }

  /**
   * Run one connection attempt. Resolves when a **stable** connection ends cleanly (so the caller
   * resets backoff); rejects with a retryable {@link ChannelError} on a pre-stable flap, a
   * retryable {@link TimeoutError} on a connect/idle timeout, the transport's typed failure, or a
   * fatal {@link AbortError} when the caller closes.
   */
  const runOneConnection = (attemptSignal: WebAbortSignal): Promise<void> => {
    setStatus(attemptsStarted === 0 ? "connecting" : "reconnecting")
    attemptsStarted++
    // A fresh transport per attempt: no attempt-local state leaks across a reconnect.
    const transport = transportFactory()

    const timeoutController = new AbortController()
    const opSignal = combineSignals(attemptSignal, timeoutController.signal)

    return new Promise<void>((resolve, reject) => {
      let settled = false
      let opened = false
      let openedAt = 0
      let cancelConnect = (): void => {}
      let cancelIdle = (): void => {}

      const cleanup = (): void => {
        cancelConnect()
        cancelIdle()
        attemptSignal.removeEventListener("abort", onCallerAbort)
        // Release the transport on every settle; a normal end also aborts an inert, already-settled
        // op.
        timeoutController.abort()
      }
      const finish = (run: () => void): void => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        run()
      }
      const isStable = (): boolean => opened && clock.now() - openedAt >= minUptimeMs
      // End the session so the reconnect loop resets backoff (a stable connection ended, S3).
      const endWithReset = (): void => finish(resolve)
      // A retryable failure: after a stable open reset backoff and reconnect promptly; otherwise (a
      // flap, or a failure before stabilizing) escalate backoff within the retry session.
      // A fatal failure always propagates to stop the loop.
      const endWithFailure = (error: unknown): void => {
        if (isRetryableFailure(error)) {
          if (isStable()) {
            // A stable connection dropped: end the session so a fresh one resets backoff (S3).
            finish(resolve)
            return
          }
          // A pre-stable flap that will be retried within this session: surface `reconnecting` now,
          // so the observable status reflects the dropped stream through the backoff wait instead
          // of lingering on a stale `open` until the next attempt starts.
          if (reconnect && !closed) {
            setStatus("reconnecting")
          }
        }
        finish(() => reject(error))
      }
      const onTimerFailure = (error: unknown): void => {
        endWithFailure(ChannelError.config("channel timer failed", { cause: error }))
      }
      const armIdle = (): void => {
        if (idleTimeoutMs === undefined) {
          return
        }
        cancelIdle()
        cancelIdle = armTimeout(
          idleTimeoutMs,
          () => endWithFailure(new TimeoutError(idleTimeoutMs)),
          onTimerFailure,
        )
      }
      function onCallerAbort(): void {
        finish(() => reject(new AbortError({ cause: attemptSignal.reason })))
      }

      cancelConnect = armTimeout(
        connectTimeoutMs,
        () => endWithFailure(new TimeoutError(connectTimeoutMs)),
        onTimerFailure,
      )

      const context = {
        headers: {} as AuthHeaders,
        signal: opSignal,
        lastEventId,
        onOpen: (): void => {
          if (settled) {
            return
          }
          cancelConnect()
          opened = true
          openedAt = clock.now()
          setStatus("open")
          armIdle()
        },
        onFrame: (frame: ChannelFrame): void => {
          if (settled) {
            return
          }
          dispatch(frame)
          armIdle()
        },
        // Cursor-only control blocks (e.g. an SSE `id:` line with no data) still move the resume
        // cursor, or the next reconnect would send a stale Last-Event-ID.
        onId: trackEventId,
      }

      if (attemptSignal.aborted) {
        onCallerAbort()
        return
      }
      attemptSignal.addEventListener("abort", onCallerAbort, { once: true })

      buildHeaders(opSignal)
        .then((headers) => {
          if (settled) {
            return
          }
          context.headers = headers
          return transport.open(context).then(
            () => {
              // Clean EOF: a stable stream resets backoff (S3); a pre-stable end is a flap that
              // escalates backoff within the retry session.
              if (isStable()) {
                endWithReset()
              } else {
                endWithFailure(ChannelError.connect("stream ended before stabilizing"))
              }
            },
            (error: unknown) => endWithFailure(error),
          )
        })
        .catch((error: unknown) => finish(() => reject(error)))
    })
  }

  const runReconnectLoop = async (channelSignal: WebAbortSignal): Promise<void> => {
    let terminalError: ChannelError | undefined
    while (!closed) {
      try {
        await runWithRetry(
          (_attempt, attemptSignal) => runOneConnection(attemptSignal),
          {
            maxAttempts: reconnect ? maxRetries + 1 : 1,
            backoff,
            idempotent: true,
            isRetryable: isRetryableFailure,
            retryAfter: () => serverRetryMs,
          },
          { random, delay, signal: channelSignal },
        )
      } catch (error) {
        // A caller close aborts `channelSignal`; that surfaces as an AbortError we swallow
        // silently.
        if (closed) {
          break
        }
        terminalError = toTerminalError(error)
        break
      }
      // A session resolved: a stable connection ended cleanly. Reconnect with a fresh session
      // (backoff reset) unless reconnection is disabled or the caller has closed.
      if (!reconnect || closed) {
        break
      }
      // Honor a server-sent `retry:` hint before the next session — consumed once and capped at the
      // backoff ceiling, exactly as `std` caps `retryAfter`.
      if (serverRetryMs !== undefined) {
        const hintMs = Math.min(serverRetryMs, backoff.maxMs)
        serverRetryMs = undefined
        try {
          await delay(hintMs, channelSignal)
        } catch (error) {
          // A caller close aborts the wait and exits via `closed` below; any other delay failure is
          // terminal rather than a silently unbounded reconnect.
          if (!closed) {
            terminalError = ChannelError.config("channel timer failed", { cause: error })
          }
          break
        }
      }
    }
    running = false
    if (!closed) {
      closed = true
    }
    setStatus("closed")
    if (terminalError !== undefined) {
      notifyError(terminalError)
    }
  }

  return {
    connect(): void {
      if (running || closed) {
        return
      }
      running = true
      attemptsStarted = 0
      controller = new AbortController()
      void runReconnectLoop(controller.signal)
    },
    close(): void {
      if (closed) {
        return
      }
      closed = true
      running = false
      setStatus("closing")
      controller?.abort(new AbortError({ cause: ChannelError.closed("channel closed by caller") }))
      setStatus("closed")
    },
    on(type: string, listener: Listener<ChannelFrame>): Subscription {
      let set = typeListeners.get(type)
      if (set === undefined) {
        set = new Set()
        typeListeners.set(type, set)
      }
      set.add(listener)
      return {
        unsubscribe: () => {
          set?.delete(listener)
        },
      }
    },
    onAny(listener: Listener<ChannelFrame>): Subscription {
      anyListeners.add(listener)
      return {
        unsubscribe: () => {
          anyListeners.delete(listener)
        },
      }
    },
    get status(): ChannelStatus {
      return status
    },
    get lastEventId(): string | undefined {
      return lastEventId
    },
  }
}

/**
 * Whether a connection failure is worth retrying, deferring status classification to `std` (a
 * `401`/`403` is fatal and stops reconnection — S1). A channel `connect` failure (transport/flap)
 * is transient and retryable; a `protocol` failure (bad content-type, missing body) fails
 * identically on retry and is fatal.
 */
function isRetryableFailure(error: unknown): boolean {
  if (error instanceof ChannelError) {
    if (error.status !== undefined) {
      return classifyStatus(error.status).disposition === "retryable"
    }
    return error.kind === "channel/connect"
  }
  return isRetryable(error)
}

/** Normalize the loop's terminal failure into a {@link ChannelError} for `onError`. */
function toTerminalError(error: unknown): ChannelError {
  // Retry exhaustion surfaces as the terminal `closed` kind, preserving the last failure as cause.
  if (error instanceof RetryError) {
    return ChannelError.closed(`reconnection exhausted after ${error.attempts} attempt(s)`, {
      cause: toLastFailure(error.cause),
    })
  }
  return toLastFailure(error)
}

/** Normalize the failure that ended the loop (or a RetryError's last attempt) into a ChannelError. */
function toLastFailure(cause: unknown): ChannelError {
  if (cause instanceof ChannelError) {
    return cause
  }
  if (cause instanceof StatusError) {
    return ChannelError.protocol(`server responded with status ${cause.status}`, {
      cause,
      status: cause.status,
    })
  }
  return ChannelError.connect(getErrorMessage(cause), { cause })
}
