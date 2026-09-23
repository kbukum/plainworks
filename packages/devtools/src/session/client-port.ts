import {
  type ErrorSnapshot,
  err,
  ok,
  PlainError,
  type Result,
  type Subscription,
  type WebAbortSignal,
} from "@plainworks/std"
import type { BridgePort } from "../bridge"
import type { Json } from "../privacy"
import {
  type DevtoolsMessage,
  PROTOCOL_VERSION,
  type SourceDescriptor,
  type SourceId,
  sourceKey,
  validateMessageEnvelope,
} from "../protocol"
import type { RetentionEntry } from "../retention"

/** Why a detail or command request did not return a value. */
export type RequestErrorKind =
  | "devtools/request-failed"
  | "devtools/request-cancelled"
  | "devtools/request-superseded"
  | "devtools/session-disposed"

/** A typed reason a client request settled without a value; the source error is kept as `cause`. */
export class RequestError extends PlainError<RequestErrorKind> {}

/** A point-in-time replay of session state, used to hydrate a newly connected client. */
export interface DevtoolsSnapshot {
  readonly sources: readonly SourceDescriptor[]
  readonly events: readonly RetentionEntry[]
  readonly indicators: readonly IndicatorEntry[]
  /** Latest failure per source, so a late-connecting client sees broken adapters too. */
  readonly failures: readonly FailureEntry[]
  readonly droppedAggregate: number
  /** Dropped event counts per source, so late-connecting clients see accurate per-source drops. */
  readonly droppedBySource: readonly DroppedSourceEntry[]
}

/** The drop count of one source, paired with its identity. */
export interface DroppedSourceEntry {
  readonly id: SourceId
  readonly count: number
}

/** The latest failure of one source, paired with its identity. */
export interface FailureEntry {
  readonly id: SourceId
  readonly error: ErrorSnapshot
}

/** The latest value of one indicator, paired with its source identity. */
export interface IndicatorEntry {
  readonly id: SourceId
  readonly indicator: Extract<DevtoolsMessage, { type: "indicator" }>["indicator"]
}

/** A resolved detail and the source sequence at which it was read. */
export interface DetailResult {
  readonly value: Json
  readonly seq: number
}

/**
 * The consumer side of a session. A client subscribes to live messages, replays current state, and
 * fetches detail or runs commands on demand. Every request is cancellable and is superseded
 * cleanly; results are correlated by id so a late or stale response is rejected.
 */
export interface DevtoolsClientPort {
  /** Observe live messages after the current snapshot. Returns teardown. */
  subscribe(listener: (message: DevtoolsMessage) => void): Subscription
  /** Current sources, retained aggregate timeline, and dropped-event count. */
  snapshot(): DevtoolsSnapshot
  /** Fetch detail and its source sequence; a prior request for the same source is superseded. */
  requestDetail(
    id: SourceId,
    ref: string,
    signal?: WebAbortSignal,
  ): Promise<Result<DetailResult, RequestError>>
  /** Run an advertised command with serializable input. */
  runCommand(
    id: SourceId,
    commandId: string,
    input: Json,
    signal?: WebAbortSignal,
  ): Promise<Result<Json, RequestError>>
  /** Release the bridge subscription and settle every pending request. */
  dispose(): void
}

interface Pending {
  readonly kind: "detail" | "command"
  succeed(value: Json, seq: number): void
  fail(error: RequestError): void
}

/**
 * Build a {@link DevtoolsClientPort} over one bridge endpoint. `snapshot` reads authoritative host
 * state directly for the embedded in-process client. `portId` namespaces this port's request ids so
 * several ports on one shared bridge never collide or settle each other's results.
 */
export function createClientPort(
  port: BridgePort,
  snapshot: () => DevtoolsSnapshot,
  portId: string,
): DevtoolsClientPort {
  const listeners = new Set<(message: DevtoolsMessage) => void>()
  const pending = new Map<string, Pending>()
  const latestDetail = new Map<string, string>()
  let counter = 0
  let terminated = false
  let cleanedUp = false
  let subscription: Subscription | undefined

  function nextId(): string {
    counter += 1
    return `${portId}-r${counter}`
  }

  function cleanup(): void {
    if (cleanedUp) return
    cleanedUp = true
    subscription?.unsubscribe()
    listeners.clear()
    latestDetail.clear()
  }

  subscription = port.subscribe((frame) => {
    const parsed = validateMessageEnvelope(frame)
    if (!parsed.ok) return
    const message = parsed.value.message
    if (message.type === "detail-result" || message.type === "command-result") {
      resolvePending(message)
      return
    }
    if (message.type === "disposed") {
      terminated = true
      settleAll("devtools/session-disposed", "Session disposed.")
    }
    for (const listener of [...listeners]) {
      try {
        listener(message)
      } catch {
        // A broken subscriber never blocks delivery to the others.
      }
    }
    if (message.type === "disposed") cleanup()
  })
  if (cleanedUp) subscription.unsubscribe()

  function resolvePending(
    message: DevtoolsMessage & { type: "detail-result" | "command-result" },
  ): void {
    const entry = pending.get(message.requestId)
    if (!entry) return
    if (!message.ok) {
      entry.fail(
        new RequestError("devtools/request-failed", "Request failed.", {
          cause: message.error,
        }),
      )
      return
    }
    if (message.type === "detail-result" && entry.kind === "detail") {
      entry.succeed(message.value, message.seq)
    } else if (message.type === "command-result" && entry.kind === "command") {
      entry.succeed(message.value, 0)
    }
  }

  function settleAll(kind: RequestErrorKind, reason: string): void {
    for (const entry of [...pending.values()]) entry.fail(new RequestError(kind, reason))
  }

  function send(request: unknown): void {
    port.post({ protocol: PROTOCOL_VERSION, request })
  }

  function track<T>(
    requestId: string,
    kind: Pending["kind"],
    signal: WebAbortSignal | undefined,
    onCleanup: () => void,
    project: (value: Json, seq: number) => T,
  ): Promise<Result<T, RequestError>> {
    return new Promise((resolve) => {
      const onAbort = () =>
        finish(err(new RequestError("devtools/request-cancelled", "Request cancelled.")), true)
      const finish = (result: Result<T, RequestError>, cancel: boolean): void => {
        if (!pending.has(requestId)) return
        pending.delete(requestId)
        signal?.removeEventListener("abort", onAbort)
        onCleanup()
        if (cancel) send({ type: "cancel", requestId })
        resolve(result)
      }
      pending.set(requestId, {
        kind,
        succeed: (value, seq) => finish(ok(project(value, seq)), false),
        fail: (error) => finish(err(error), false),
      })
      if (signal?.aborted) {
        finish(err(new RequestError("devtools/request-cancelled", "Request cancelled.")), true)
        return
      }
      signal?.addEventListener("abort", onAbort, { once: true })
    })
  }

  return {
    subscribe(listener) {
      if (terminated) return { unsubscribe: () => {} }
      listeners.add(listener)
      return { unsubscribe: () => listeners.delete(listener) }
    },
    snapshot,
    requestDetail(id, ref, signal) {
      if (terminated) {
        return Promise.resolve(
          err(new RequestError("devtools/session-disposed", "Session disposed.")),
        )
      }
      const requestId = nextId()
      const key = sourceKey(id)
      const superseded = latestDetail.get(key)
      if (superseded) {
        pending
          .get(superseded)
          ?.fail(new RequestError("devtools/request-superseded", "Superseded by a newer request."))
      }
      latestDetail.set(key, requestId)
      const promise = track(
        requestId,
        "detail",
        signal,
        () => {
          if (latestDetail.get(key) === requestId) latestDetail.delete(key)
        },
        (value, seq) => ({ value, seq }),
      )
      send({ type: "detail-request", requestId, id, ref })
      return promise
    },
    runCommand(id, commandId, input, signal) {
      if (terminated) {
        return Promise.resolve(
          err(new RequestError("devtools/session-disposed", "Session disposed.")),
        )
      }
      const requestId = nextId()
      const promise = track(
        requestId,
        "command",
        signal,
        () => {},
        (value) => value,
      )
      send({ type: "command-request", requestId, id, commandId, input })
      return promise
    },
    dispose() {
      if (terminated && cleanedUp) return
      terminated = true
      settleAll("devtools/session-disposed", "Session disposed.")
      cleanup()
    },
  }
}
