import {
  createErrorSnapshot,
  type ErrorSnapshot,
  isRecord,
  PlainError,
  type Subscription,
  type WebAbortController,
} from "@plainworks/std"
import { type Bridge, createMemoryBridge } from "../bridge"
import { type Json, type SanitizeOptions, sanitize } from "../privacy"
import {
  type DevtoolsMessage,
  PROTOCOL_VERSION,
  parseCommandInput,
  type SourceDescriptor,
  type SourceEvent,
  type SourceId,
  type StatusIndicator,
  sourceKey,
  validateRequestEnvelope,
} from "../protocol"
import { createRetentionBuffer, type RetentionBuffer, type RetentionCapacity } from "../retention"
import type { Source, SourceHandle, SourceObserver } from "../source"
import {
  createClientPort,
  type DevtoolsClientPort,
  type DevtoolsSnapshot,
  type IndicatorEntry,
} from "./client-port"

/** A source registered twice under the same identity — a programming error, surfaced typed. */
export class DuplicateSourceError extends PlainError<"devtools/duplicate-source"> {
  constructor(id: SourceId) {
    super("devtools/duplicate-source", `A source is already registered for ${sourceKey(id)}.`)
  }
}

/** Construction options for {@link createDevtoolsSession}; every one has a safe default. */
export interface DevtoolsSessionOptions {
  /** Retention capacities for the timeline; defaults to bounded per-source and aggregate rings. */
  readonly retention?: RetentionCapacity
  /** Default sanitize bounds applied to every forwarded payload. */
  readonly sanitize?: SanitizeOptions
  /** Transport to the client; defaults to a host-free in-memory bridge the session owns. */
  readonly bridge?: Bridge
}

/**
 * The host-side aggregator. Sources register into it; it sanitizes, orders, retains, and forwards
 * their output over a bridge, and routes client detail and command requests back. It owns every
 * source connection, pending request, and buffer — disposing it releases all of them.
 */
export interface DevtoolsSession {
  /** Register a source and start observing it; the returned {@link Subscription} deregisters it. */
  registerSource(source: Source): Subscription
  /** Open a consumer port for the client shell. */
  connect(): DevtoolsClientPort
  /** Tear down every source, pending request, buffer, and the owned bridge. Idempotent. */
  dispose(): void
}

const DEFAULT_RETENTION: RetentionCapacity = { perSource: 200, aggregate: 500 }

interface SourceEntry {
  readonly descriptor: SourceDescriptor
  handle: SourceHandle
  seq: number
  readonly controller: WebAbortController
}

/** A host-side in-flight detail/command request, linked to its source so teardown can cancel it. */
interface PendingRequest {
  readonly controller: WebAbortController
  readonly sourceKey: string
  readonly kind: "detail" | "command"
}

/**
 * Create a {@link DevtoolsSession}. Nothing is observed until a source is registered, and no work
 * happens at import time — the session is an explicitly constructed, per-host object. Sources stamp
 * their own event and indicator timestamps; the session forwards them unchanged.
 */
export function createDevtoolsSession(options: DevtoolsSessionOptions = {}): DevtoolsSession {
  const sanitizeOptions = options.sanitize
  const bridge = options.bridge ?? createMemoryBridge()
  const ownsBridge = options.bridge === undefined
  const retention: RetentionBuffer = createRetentionBuffer(options.retention ?? DEFAULT_RETENTION)

  const sources = new Map<string, SourceEntry>()
  const indicators = new Map<string, Map<string, IndicatorEntry>>()
  const failures = new Map<string, ErrorSnapshot>()
  const requests = new Map<string, PendingRequest>()
  let reportedAggregateDropped = 0
  let portSeq = 0
  let disposed = false

  function post(message: DevtoolsMessage): void {
    if (disposed && message.type !== "disposed") return
    bridge.host.post({ protocol: PROTOCOL_VERSION, message })
  }

  function postRequestFailed(requestId: string, kind: "detail" | "command", error: unknown): void {
    const snapshot = sanitizeError(error)
    post(
      kind === "detail"
        ? { type: "detail-result", requestId, ok: false, error: snapshot }
        : { type: "command-result", requestId, ok: false, error: snapshot },
    )
  }

  function sanitizeError(error: unknown): ErrorSnapshot {
    const snapshot = createErrorSnapshot(error)
    const sanitized = sanitize(snapshot, sanitizeOptions)
    const name = sanitize(snapshot.name, sanitizeOptions)
    const message = sanitize(snapshot.message, sanitizeOptions)
    const required = {
      name: typeof name === "string" && name.length > 0 ? name : "PlainError",
      message: typeof message === "string" && message.length > 0 ? message : "Unknown error thrown",
    }
    return isRecord(sanitized) ? { ...sanitized, ...required } : required
  }

  function reportDropped(id: SourceId): void {
    const total = retention.droppedAggregate()
    if (total > reportedAggregateDropped) {
      reportedAggregateDropped = total
      post({ type: "dropped", id: null, count: total })
    }
    const perSource = retention.droppedForSource(id)
    if (perSource > 0) post({ type: "dropped", id, count: perSource })
  }

  function sanitizeEvent(event: SourceEvent): SourceEvent {
    const safeLabel = sanitize(event.label, sanitizeOptions)
    const label = typeof safeLabel === "string" && safeLabel.length > 0 ? safeLabel : event.label
    if (event.summary === undefined) return { ...event, label }
    return { ...event, label, summary: sanitize(event.summary, sanitizeOptions) }
  }

  function sanitizeIndicator(indicator: StatusIndicator): StatusIndicator {
    return { ...indicator, value: String(sanitize(indicator.value, sanitizeOptions)) }
  }

  function observerFor(entry: SourceEntry): SourceObserver {
    const id = entry.descriptor.id
    return {
      emit(event: SourceEvent) {
        if (disposed || !sources.has(sourceKey(id))) return
        const safe = sanitizeEvent(event)
        entry.seq += 1
        retention.push({ id, seq: entry.seq, event: safe })
        post({ type: "event", id, seq: entry.seq, event: safe })
        reportDropped(id)
      },
      indicate(indicator: StatusIndicator) {
        const key = sourceKey(id)
        if (disposed || !sources.has(key)) return
        const safe = sanitizeIndicator(indicator)
        let sourceIndicators = indicators.get(key)
        if (!sourceIndicators) {
          sourceIndicators = new Map()
          indicators.set(key, sourceIndicators)
        }
        sourceIndicators.set(safe.id, { id, indicator: safe })
        post({ type: "indicator", id, indicator: safe })
      },
      fail(error: unknown) {
        const key = sourceKey(id)
        if (disposed || !sources.has(key)) return
        const snapshot = sanitizeError(error)
        failures.set(key, snapshot)
        post({ type: "source-failed", id, error: snapshot })
      },
      recover() {
        const key = sourceKey(id)
        if (disposed || !sources.has(key) || !failures.has(key)) return
        failures.delete(key)
        post({ type: "source-recovered", id })
      },
    }
  }

  function cancelRequestsForSource(key: string): void {
    for (const [requestId, request] of [...requests.entries()]) {
      if (request.sourceKey !== key) continue
      requests.delete(requestId)
      request.controller.abort()
      postRequestFailed(requestId, request.kind, new Error("Source removed."))
    }
  }

  function deregister(key: string): void {
    const entry = sources.get(key)
    if (!entry) return
    entry.controller.abort()
    cancelRequestsForSource(key)
    try {
      entry.handle.dispose()
    } catch (error) {
      post({ type: "source-failed", id: entry.descriptor.id, error: sanitizeError(error) })
    }
    sources.delete(key)
    retention.forget(entry.descriptor.id)
    indicators.delete(key)
    failures.delete(key)
    post({ type: "source-removed", id: entry.descriptor.id })
  }

  async function resolveDetail(requestId: string, id: SourceId, ref: string): Promise<void> {
    const entry = sources.get(sourceKey(id))
    if (!entry?.handle.resolveDetail) {
      post({
        type: "detail-result",
        requestId,
        ok: false,
        error: sanitizeError(new Error("No detail available.")),
      })
      return
    }
    const controller = new AbortController()
    requests.set(requestId, { controller, sourceKey: sourceKey(id), kind: "detail" })
    try {
      const value = await entry.handle.resolveDetail(ref, controller.signal)
      if (controller.signal.aborted) return
      post({
        type: "detail-result",
        requestId,
        ok: true,
        seq: entry.seq,
        value: sanitize(value, sanitizeOptions),
      })
    } catch (error) {
      if (!controller.signal.aborted) {
        post({ type: "detail-result", requestId, ok: false, error: sanitizeError(error) })
      }
    } finally {
      requests.delete(requestId)
    }
  }

  async function runCommand(
    requestId: string,
    id: SourceId,
    commandId: string,
    input: Json,
  ): Promise<void> {
    const entry = sources.get(sourceKey(id))
    const command = entry?.descriptor.commands.find((candidate) => candidate.id === commandId)
    if (!entry || !command?.available || !entry.handle.runCommand) {
      post({
        type: "command-result",
        requestId,
        ok: false,
        error: sanitizeError(new Error("Command unavailable.")),
      })
      return
    }
    const parsed = parseCommandInput(input)
    if (!parsed.ok) {
      post({
        type: "command-result",
        requestId,
        ok: false,
        error: sanitizeError(parsed.error),
      })
      return
    }
    const controller = new AbortController()
    requests.set(requestId, { controller, sourceKey: sourceKey(id), kind: "command" })
    try {
      const value = await entry.handle.runCommand(commandId, parsed.value, controller.signal)
      if (controller.signal.aborted) return
      post({ type: "command-result", requestId, ok: true, value: sanitize(value, sanitizeOptions) })
    } catch (error) {
      if (!controller.signal.aborted) {
        post({ type: "command-result", requestId, ok: false, error: sanitizeError(error) })
      }
    } finally {
      requests.delete(requestId)
    }
  }

  const hostSubscription = bridge.host.subscribe((frame) => {
    if (disposed) return
    const parsed = validateRequestEnvelope(frame)
    if (!parsed.ok) return
    const request = parsed.value.request
    switch (request.type) {
      case "cancel":
        requests.get(request.requestId)?.controller.abort()
        break
      case "detail-request":
        void resolveDetail(request.requestId, request.id, request.ref)
        break
      case "command-request":
        void runCommand(request.requestId, request.id, request.commandId, request.input)
        break
    }
  })

  function snapshot(): DevtoolsSnapshot {
    return {
      sources: [...sources.values()].map((entry) => entry.descriptor),
      events: retention.aggregate(),
      indicators: [...indicators.values()].flatMap((sourceIndicators) => [
        ...sourceIndicators.values(),
      ]),
      failures: [...failures.entries()].flatMap(([key, error]) => {
        const entry = sources.get(key)
        return entry ? [{ id: entry.descriptor.id, error }] : []
      }),
      droppedAggregate: retention.droppedAggregate(),
      droppedBySource: [...sources.values()]
        .map((entry) => ({
          id: entry.descriptor.id,
          count: retention.droppedForSource(entry.descriptor.id),
        }))
        .filter((entry) => entry.count > 0),
    }
  }

  return {
    registerSource(source) {
      if (disposed) throw new PlainError("devtools/session-disposed", "Session is disposed.")
      const key = sourceKey(source.id)
      if (sources.has(key)) throw new DuplicateSourceError(source.id)

      const entry: SourceEntry = {
        descriptor: { id: source.id, label: source.label, commands: source.commands ?? [] },
        handle: { dispose: () => {} },
        seq: 0,
        controller: new AbortController(),
      }
      sources.set(key, entry)
      post({ type: "source-added", source: entry.descriptor })

      try {
        entry.handle = source.connect(observerFor(entry), entry.controller.signal)
      } catch (error) {
        const snapshot = sanitizeError(error)
        failures.set(key, snapshot)
        post({ type: "source-failed", id: source.id, error: snapshot })
      }
      return { unsubscribe: () => deregister(key) }
    },
    connect() {
      if (disposed) throw new PlainError("devtools/session-disposed", "Session is disposed.")
      portSeq += 1
      return createClientPort(bridge.client, snapshot, `p${portSeq}`)
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const entry of [...sources.values()]) {
        entry.controller.abort()
        try {
          entry.handle.dispose()
        } catch {
          // Teardown proceeds even if one source's dispose throws.
        }
      }
      sources.clear()
      for (const request of [...requests.values()]) request.controller.abort()
      requests.clear()
      retention.clear()
      indicators.clear()
      failures.clear()
      post({ type: "disposed" })
      hostSubscription.unsubscribe()
      if (ownsBridge) bridge.dispose()
    },
  }
}
