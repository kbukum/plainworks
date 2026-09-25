import type { Channel, ChannelOptions, ChannelStatus } from "@plainworks/channel"
import { assertTimerMs, type StreamFrame, type Subscription } from "@plainworks/std"
import type { Json } from "../../privacy"
import type { Severity } from "../../protocol"
import { createEventSampler, type EventSampler } from "../../retention"
import type { Source, SourceHandle } from "../../source"
import { createObserverRelay, observeSafely } from "../observer-relay"

// Stateless UTF-8 encoder reused to size a frame without copying its `data` into the summary.
const frameEncoder = new TextEncoder()

/** Options for {@link createChannelSource}. */
export interface ChannelSourceOptions {
  /**
   * Stable identity for this channel instance. Required whenever an app composes more than one
   * channel — the adapter never guesses identity from runtime state.
   */
  readonly instance: string
  /** Display label; defaults to `Channel <instance>`. */
  readonly label?: string
  /** Clock for event and indicator timestamps. Defaults to `Date.now`. */
  readonly now?: () => number
  /**
   * Coalescing interval for per-frame events, in milliseconds. A high-frequency stream collapses to
   * one frame event per interval while the running count stays exact; lifecycle transitions are
   * never sampled. Defaults to 250; `0` emits every frame.
   */
  readonly frameIntervalMs?: number
  /**
   * Safe projection of frame metadata into a summary. The callback never receives frame `data`;
   * the session's redaction still runs over its result.
   */
  readonly frameSummary?: (metadata: ChannelFrameMetadata) => Json
}

/** Frame metadata safe to expose to a custom summary. */
export interface ChannelFrameMetadata {
  readonly type: string
  readonly bytes: number
  readonly id?: string
}

/** The source plus the two seams a host wires a channel through, returned by {@link createChannelSource}. */
export interface ChannelInstrumentation {
  /** Register this with a {@link @plainworks/devtools!DevtoolsSession}. */
  readonly source: Source
  /**
   * Decorate the channel's options so lifecycle transitions and errors feed the source. The host's
   * own `onStatusChange`/`onError` are preserved and still called — this composes, never replaces.
   */
  instrument(options: ChannelOptions): ChannelOptions
  /**
   * Observe frames on a constructed channel for bounded event counts, last-event id, and safe
   * summaries. Returns teardown; the source also releases it on disposal.
   */
  observe(channel: Channel): Subscription
}

const DEFAULT_FRAME_INTERVAL_MS = 250

/**
 * Observe an `@plainworks/channel` connection as a devtools source.
 * {@link ChannelInstrumentation.instrument} composes the channel's lifecycle callbacks so status
 * transitions, reconnect attempts, and errors are reported without displacing the host's handlers;
 * {@link ChannelInstrumentation.observe} counts frames and tracks the last-event id, coalescing a
 * high-frequency stream so the timeline stays bounded. Only frame metadata crosses the boundary by
 * default — never the frame `data`.
 */
export function createChannelSource(options: ChannelSourceOptions): ChannelInstrumentation {
  const now = options.now ?? Date.now
  const label = options.label ?? `Channel ${options.instance}`
  const relay = createObserverRelay()
  const frameIntervalMs = options.frameIntervalMs ?? DEFAULT_FRAME_INTERVAL_MS
  assertTimerMs(frameIntervalMs)
  const summarizeFrame = options.frameSummary ?? defaultFrameSummary

  const state = {
    status: "idle" as ChannelStatus,
    reconnects: 0,
    frames: 0,
    lastEventId: undefined as string | undefined,
  }
  const observations = new Set<Subscription>()

  function indicate(): void {
    relay.indicate({
      id: "channel",
      label,
      value: describeState(state),
      severity: statusSeverity(state.status),
      updatedAt: now(),
      target: "channel",
    })
  }

  function recordStatus(status: ChannelStatus): void {
    // Guarded so a devtools fault never propagates into the channel's own callback dispatch or
    // stops the host's composed handler from running.
    observeSafely(relay, () => {
      if (status === "reconnecting") state.reconnects += 1
      state.status = status
      relay.emit({
        kind: "channel.status",
        label: `Channel ${status}`,
        severity: statusSeverity(status),
        at: now(),
        summary: { status, reconnects: state.reconnects },
      })
      indicate()
    })
  }

  function recordError(error: { readonly kind: string; readonly message: string }): void {
    observeSafely(relay, () => {
      const kind = safeChannelErrorKind(error.kind)
      relay.emit({
        kind: "channel.error",
        label: `Channel error: ${kind}`,
        severity: "error",
        at: now(),
        summary: { kind },
      })
      indicate()
    })
  }

  const source: Source = {
    id: { kind: "channel", instance: options.instance },
    label,
    connect(observer) {
      const unbind = relay.bind(observer)
      observeSafely(relay, indicate)
      const handle: SourceHandle = {
        dispose() {
          if (!unbind()) return
          for (const observation of observations) observation.unsubscribe()
          observations.clear()
        },
      }
      return handle
    },
  }

  return {
    source,
    instrument(base) {
      return {
        ...base,
        onStatusChange(status) {
          recordStatus(status)
          base.onStatusChange?.(status)
        },
        onError(error) {
          recordError(error)
          base.onError?.(error)
        },
      }
    },
    observe(channel) {
      state.status = channel.status
      state.lastEventId = channel.lastEventId
      observeSafely(relay, indicate)
      const sampler = createEventSampler({
        intervalMs: frameIntervalMs,
        mode: "coalesce",
        onEmit: (event) => observeSafely(relay, () => relay.emit(event)),
        onError: (error) => observeSafely(relay, () => relay.fail(error)),
        now,
      })
      const frames = channel.onAny((frame) => {
        state.frames += 1
        if (frame.id !== undefined) state.lastEventId = frame.id
        observeSafely(relay, () => {
          const metadata = frameMetadata(frame)
          sampler.offer({
            kind: "channel.event",
            label: `Event ${frame.type}`,
            severity: "info",
            at: now(),
            summary: summarizeFrame(metadata),
          })
          indicate()
        })
      })
      const observation = teardown(sampler, frames, observations)
      observations.add(observation)
      return observation
    },
  }
}

function safeChannelErrorKind(kind: string): string {
  switch (kind) {
    case "channel/config":
    case "channel/connect":
    case "channel/protocol":
    case "channel/closed":
      return kind
    default:
      return "channel/error"
  }
}

function teardown(
  sampler: EventSampler,
  frames: Subscription,
  observations: Set<Subscription>,
): Subscription {
  let released = false
  const observation: Subscription = {
    unsubscribe() {
      if (released) return
      released = true
      sampler.flush()
      sampler.dispose()
      frames.unsubscribe()
      observations.delete(observation)
    },
  }
  return observation
}

function frameMetadata(frame: StreamFrame): ChannelFrameMetadata {
  return {
    type: frame.type,
    bytes: frameEncoder.encode(frame.data).length,
    ...(frame.id !== undefined ? { id: frame.id } : {}),
  }
}

/** The default frame summary: type, optional id, and UTF-8 byte size — never the frame `data`. */
function defaultFrameSummary(metadata: ChannelFrameMetadata): Json {
  return {
    type: metadata.type,
    bytes: metadata.bytes,
    ...(metadata.id !== undefined ? { id: metadata.id } : {}),
  }
}

function statusSeverity(status: ChannelStatus): Severity {
  switch (status) {
    case "open":
      return "ok"
    case "reconnecting":
    case "closed":
      return "warn"
    default:
      return "info"
  }
}

function describeState(state: {
  readonly status: ChannelStatus
  readonly reconnects: number
  readonly frames: number
  readonly lastEventId: string | undefined
}): string {
  const parts: string[] = [state.status]
  if (state.frames > 0) parts.push(`${state.frames} event${state.frames === 1 ? "" : "s"}`)
  if (state.reconnects > 0)
    parts.push(`${state.reconnects} reconnect${state.reconnects === 1 ? "" : "s"}`)
  if (state.lastEventId !== undefined) parts.push(`last-event-id ${state.lastEventId}`)
  return parts.join(" · ")
}
