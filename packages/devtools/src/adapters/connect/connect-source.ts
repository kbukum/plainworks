import { Code, ConnectError, type Interceptor } from "@connectrpc/connect"
import { mapConnectError, type RpcErrorCode } from "@plainworks/connect"
import { assertTimerMs, type WebAbortSignal } from "@plainworks/std"
import { createEventSampler } from "../../retention"
import type { Source, SourceHandle } from "../../source"
import {
  type Correlator,
  createCorrelator,
  createExchangeTally,
  type ExchangeOutcome,
  type ExchangeTally,
  isDeadlineAbort,
  outcomeSeverity,
} from "../correlation"
import { createObserverRelay, type ObserverRelay, observeSafely } from "../observer-relay"

/** Options for {@link createConnectSource}. */
export interface ConnectSourceOptions {
  /**
   * Stable identity for this transport instance. Required whenever an app composes more than one
   * Connect transport — the adapter never guesses identity from runtime state.
   */
  readonly instance: string
  /** Display label; defaults to `RPC <instance>`. */
  readonly label?: string
  /** Clock for event and indicator timestamps. Defaults to `Date.now`. */
  readonly now?: () => number
  /**
   * Coalescing interval for a streaming call's per-message events, in milliseconds. A busy stream
   * collapses to one message event per interval; the open and close events are always emitted.
   * Defaults to 250; `0` emits every message.
   */
  readonly messageIntervalMs?: number
}

/** The interceptor/source pair returned by {@link createConnectSource}. */
export interface ConnectInstrumentation {
  /** Register this with a {@link @plainworks/devtools!DevtoolsSession}. */
  readonly source: Source
  /**
   * Pass this to `createConnectRpcTransport({ interceptors: [interceptor] })`. It observes each
   * unary call and streaming lifecycle without altering the call or its error contract.
   */
  readonly interceptor: Interceptor
}

const DEFAULT_MESSAGE_INTERVAL_MS = 250

/**
 * Observe an `@plainworks/connect` transport as a devtools source. The returned
 * {@link ConnectInstrumentation.interceptor} works in terms of service/method identity and the
 * streaming lifecycle rather than HTTP assumptions: a unary call reports a correlated
 * start/settle pair; a streaming call reports open, coalesced message counts, and a definite close
 * carrying the total and outcome. Because the interceptor runs inside the transport's resilience
 * loop, a retried unary call surfaces as one start/settle pair per attempt.
 *
 * Only metadata crosses the boundary — service, method, message counts, duration, and a typed
 * failure code — never a request or response message. The original error is always re-thrown
 * untouched.
 */
export function createConnectSource(options: ConnectSourceOptions): ConnectInstrumentation {
  const now = options.now ?? Date.now
  const relay = createObserverRelay()
  const correlator = createCorrelator("rpc")
  const messageIntervalMs = options.messageIntervalMs ?? DEFAULT_MESSAGE_INTERVAL_MS
  assertTimerMs(messageIntervalMs)
  const activeStreams = new Set<ActiveStreamObservation>()

  const tally = createExchangeTally()
  function indicate(): void {
    relay.indicate({
      id: "rpc",
      label: options.label ?? `RPC ${options.instance}`,
      ...tally.readout("call"),
      updatedAt: now(),
      target: "connect",
    })
  }

  const interceptor = createConnectInterceptor({
    now,
    relay,
    correlator,
    tally,
    indicate,
    messageIntervalMs,
    activeStreams,
  })

  const source: Source = {
    id: { kind: "connect", instance: options.instance },
    label: options.label ?? `RPC ${options.instance}`,
    connect(observer) {
      const unbind = relay.bind(observer)
      observeSafely(relay, indicate)
      const handle: SourceHandle = {
        dispose() {
          if (!unbind()) return
          for (const stream of activeStreams) stream.dispose()
          activeStreams.clear()
        },
      }
      return handle
    },
  }

  return { source, interceptor }
}

interface InterceptorDeps {
  readonly now: () => number
  readonly relay: ObserverRelay
  readonly correlator: Correlator
  readonly tally: ExchangeTally
  readonly indicate: () => void
  readonly messageIntervalMs: number
  readonly activeStreams: Set<ActiveStreamObservation>
}

function createConnectInterceptor(deps: InterceptorDeps): Interceptor {
  const { now, relay, correlator, tally, indicate, messageIntervalMs, activeStreams } = deps
  return (next) => async (request) => {
    const id = correlator.next()
    const service = request.service.typeName
    const method = request.method.name
    const rpc = `${service}/${method}`
    let startedAt: number | undefined
    // Every observation runs through `observeSafely`, so a timeline fault can never replace the
    // response or error the caller is owed — the outcome comes from `next(request)` alone.
    observeSafely(relay, () => {
      startedAt = now()
      tally.start()
      relay.emit({
        kind: request.stream ? "rpc.stream.open" : "rpc.request",
        label: request.stream ? `stream ${rpc}` : rpc,
        severity: "info",
        at: startedAt,
        summary: { id, service, method, stream: request.stream },
      })
      indicate()
    })

    const settleUnary = (classification: ConnectClassification): void => {
      if (startedAt === undefined) return
      const { outcome, code } = classification
      const observedStartedAt = startedAt
      tally.settle(outcome)
      observeSafely(relay, () => {
        const endedAt = now()
        const durationMs = endedAt - observedStartedAt
        relay.emit({
          kind: settleKind(outcome),
          label: `${rpc} ${outcome} (${durationMs}ms)`,
          severity: outcomeSeverity(outcome),
          at: endedAt,
          summary: {
            id,
            service,
            method,
            durationMs,
            outcome,
            ...(code !== undefined ? { code } : {}),
          },
        })
        if (outcome === "ok") relay.recover()
        indicate()
      })
    }

    let response: Awaited<ReturnType<typeof next>>
    try {
      response = await next(request)
    } catch (error) {
      settleUnary(classifyConnectError(error, request.signal))
      // Re-throw untouched: instrumentation never changes the caller's error contract.
      throw error
    }
    if (!response.stream) {
      settleUnary({ outcome: "ok" })
      return response
    }
    if (startedAt === undefined) return response
    // Wrap the output stream so message counts and the terminal outcome are observed as the
    // caller consumes it; the raw async iterable is never drained by the adapter itself.
    return {
      ...response,
      message: trackStream(response.message, {
        id,
        service,
        method,
        startedAt,
        now,
        relay,
        tally,
        indicate,
        messageIntervalMs,
        signal: request.signal,
        activeStreams,
      }),
    }
  }
}

interface StreamContext {
  readonly id: string
  readonly service: string
  readonly method: string
  readonly startedAt: number
  readonly now: () => number
  readonly relay: ObserverRelay
  readonly tally: ExchangeTally
  readonly indicate: () => void
  readonly messageIntervalMs: number
  readonly signal: WebAbortSignal | undefined
  readonly activeStreams: Set<ActiveStreamObservation>
}

interface ActiveStreamObservation {
  dispose(): void
}

/**
 * Wrap a Connect output stream to count messages and emit a single terminal close event. Normal
 * completion closes `ok`; a thrown error closes with its classified outcome and re-throws; a
 * consumer that stops early (an unsettled `finally`) closes `canceled`. The source iterator's
 * `return` always runs on exit, and the per-message sampler is disposed exactly once. Every
 * timeline emission is isolated with `observeSafely`, so a devtools fault never surfaces as a
 * stream error to the consumer.
 */
function trackStream<T>(source: AsyncIterable<T>, ctx: StreamContext): AsyncIterable<T> {
  const sampler = createEventSampler({
    intervalMs: ctx.messageIntervalMs,
    mode: "coalesce",
    onEmit: (event) => observeSafely(ctx.relay, () => ctx.relay.emit(event)),
    onError: (error) => observeSafely(ctx.relay, () => ctx.relay.fail(error)),
    now: ctx.now,
  })
  const rpc = `${ctx.service}/${ctx.method}`
  let active = true

  const observation: ActiveStreamObservation = {
    dispose() {
      if (!active) return
      active = false
      sampler.dispose()
      ctx.activeStreams.delete(observation)
      ctx.tally.release()
    },
  }
  ctx.activeStreams.add(observation)

  const close = (classification: ConnectClassification, count: number): void => {
    if (!active) return
    active = false
    ctx.activeStreams.delete(observation)
    const { outcome, code } = classification
    ctx.tally.settle(outcome)
    observeSafely(ctx.relay, () => {
      sampler.flush()
      const endedAt = ctx.now()
      const durationMs = endedAt - ctx.startedAt
      ctx.relay.emit({
        kind: streamCloseKind(outcome),
        label: `stream ${rpc} ${outcome} · ${count} message${count === 1 ? "" : "s"} (${durationMs}ms)`,
        severity: outcomeSeverity(outcome),
        at: endedAt,
        summary: {
          id: ctx.id,
          service: ctx.service,
          method: ctx.method,
          messages: count,
          durationMs,
          outcome,
          ...(code !== undefined ? { code } : {}),
        },
      })
      if (outcome === "ok") ctx.relay.recover()
      ctx.indicate()
    })
    sampler.dispose()
  }

  return {
    [Symbol.asyncIterator]() {
      const iterator = source[Symbol.asyncIterator]()
      let count = 0
      let settled = false

      const cleanupAfterPrimaryOutcome = async (): Promise<void> => {
        try {
          await iterator.return?.()
        } catch (error) {
          observeSafely(ctx.relay, () => ctx.relay.fail(error))
        }
      }

      return {
        async next(): Promise<IteratorResult<T>> {
          if (settled) return { done: true, value: undefined }
          try {
            const result = await iterator.next()
            if (result.done === true) {
              settled = true
              close({ outcome: "ok" }, count)
              await cleanupAfterPrimaryOutcome()
              return result
            }
            count += 1
            if (active) {
              observeSafely(ctx.relay, () => {
                sampler.offer({
                  kind: "rpc.stream.message",
                  label: `stream ${rpc} · ${count} message${count === 1 ? "" : "s"}`,
                  severity: "info",
                  at: ctx.now(),
                  summary: {
                    id: ctx.id,
                    service: ctx.service,
                    method: ctx.method,
                    messages: count,
                  },
                })
              })
            }
            return result
          } catch (error) {
            settled = true
            close(classifyConnectError(error, ctx.signal), count)
            await cleanupAfterPrimaryOutcome()
            throw error
          }
        },
        async return(): Promise<IteratorResult<T>> {
          if (settled) return { done: true, value: undefined }
          try {
            const result = await iterator.return?.()
            settled = true
            close(
              isDeadlineAbort(ctx.signal)
                ? { outcome: "timeout", code: "deadline_exceeded" }
                : { outcome: "canceled" },
              count,
            )
            return result ?? { done: true, value: undefined }
          } catch (error) {
            settled = true
            close(classifyConnectError(error, ctx.signal), count)
            throw error
          }
        },
      }
    },
  }
}

/**
 * A settled Connect exchange's shared {@link ExchangeOutcome} plus, on a failure, the typed Connect
 * {@link @plainworks/connect!RpcErrorCode} that produced it — the diagnostic code the public
 * adapter documentation promises.
 */
interface ConnectClassification {
  readonly outcome: ExchangeOutcome
  readonly code?: RpcErrorCode
}

/**
 * Classify a thrown Connect outcome and its typed failure code. A `ConnectError` carries a `Code`:
 * `DeadlineExceeded` is a timeout, `Canceled` is a cancellation — unless the attempt signal shows a
 * per-attempt deadline abort, which surfaces as `Canceled` here before the outer resilience layer
 * remaps it to `DeadlineExceeded`. A bare `AbortError` is a per-attempt timeout when its signal
 * timed out, otherwise a caller cancellation; anything else is an error. The code is read via the
 * canonical {@link @plainworks/connect!mapConnectError} (never thrown, only projected) so the
 * timeline matches the kit's `RpcError.code` vocabulary.
 */
function classifyConnectError(
  error: unknown,
  signal: WebAbortSignal | undefined,
): ConnectClassification {
  if (error instanceof ConnectError) {
    const code = mapConnectError(error).code
    if (error.code === Code.Canceled) {
      return isDeadlineAbort(signal)
        ? { outcome: "timeout", code: "deadline_exceeded" }
        : { outcome: "canceled", code }
    }
    if (error.code === Code.DeadlineExceeded) return { outcome: "timeout", code }
    return { outcome: "error", code }
  }
  if (error instanceof Error && error.name === "AbortError") {
    return isDeadlineAbort(signal)
      ? { outcome: "timeout", code: "deadline_exceeded" }
      : { outcome: "canceled", code: "canceled" }
  }
  return { outcome: "error", code: "unknown" }
}

/** The timeline kind for a settled unary call: a dedicated kind per outcome so filters read cleanly. */
function settleKind(outcome: ExchangeOutcome): string {
  switch (outcome) {
    case "ok":
      return "rpc.response"
    case "timeout":
      return "rpc.timeout"
    case "canceled":
      return "rpc.canceled"
    default:
      return "rpc.error"
  }
}

/** The timeline kind for a stream's terminal close event, one per outcome. */
function streamCloseKind(outcome: ExchangeOutcome): string {
  switch (outcome) {
    case "ok":
      return "rpc.stream.close"
    case "timeout":
      return "rpc.stream.timeout"
    case "canceled":
      return "rpc.stream.canceled"
    default:
      return "rpc.stream.error"
  }
}
