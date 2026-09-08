import type { AuthHeaders, WebAbortSignal } from "@plainworks/std"

/**
 * A raw, decoded wire frame a transport emits — the untrusted event before any application
 * decoding. SSE fills `type`/`data`/`id`/`retry` from the event-stream fields; a WebSocket frame
 * carries a single `type` (default `"message"`) and its text `data`. `data` is **untrusted input**:
 * decode and validate it at the event-router boundary before it reaches application state.
 */
export interface ChannelFrame {
  /** Event discriminant — the SSE `event:` field, or `"message"` by default. */
  readonly type: string
  /** Raw payload string (untrusted). */
  readonly data: string
  /** Server event id (SSE `id:`); becomes the `Last-Event-ID` header on the next reconnect. */
  readonly id?: string | undefined
  /** Server-requested reconnection delay in ms (SSE `retry:`), when provided. */
  readonly retry?: number | undefined
}

/**
 * Everything a single connection attempt needs, owned by the channel core and handed to the
 * transport for the duration of that attempt. The transport must:
 *
 * - attach {@link headers} to the connection (header-only auth — a credential NEVER goes in the
 *   URL);
 * - honor {@link signal} for cancellation — the core aborts it on connect timeout, idle timeout, or
 *   caller `close()`, so the transport must abandon its in-flight work when it fires;
 * - call {@link onOpen} exactly once when the connection is established (before the first frame),
 *   so the core can clear the connect timeout, start the uptime clock, and surface `open`;
 * - call {@link onFrame} for each decoded frame, which the core dispatches and uses to reset the
 *   idle-read timer.
 *
 * Resume state is header-only: {@link lastEventId}, when set, is sent as `Last-Event-ID`.
 */
export interface TransportContext {
  /** Resolved headers (auth + static) to attach to the connection. */
  readonly headers: AuthHeaders
  /** Attempt cancellation — aborts on connect/idle timeout or caller close. */
  readonly signal: WebAbortSignal
  /** Last seen event id for header-only resume, when reconnecting a known stream. */
  readonly lastEventId?: string | undefined
  /** Called once when the connection is established, before the first frame. */
  readonly onOpen: () => void
  /** Called for each decoded frame. */
  readonly onFrame: (frame: ChannelFrame) => void
  /**
   * Called for every resume-cursor update, including cursor-only control blocks that carry no frame
   * (an SSE `id:`-only block) — without it a reconnect would resume from a stale `Last-Event-ID`.
   * An empty string resets the cursor (the next attempt sends no `Last-Event-ID`).
   */
  readonly onId?: ((id: string) => void) | undefined
}

/**
 * The pluggable wire seam: one logical connection lifetime. `open` resolves when the stream ends
 * **cleanly** (server EOF) and rejects with a typed error on failure or when
 * {@link TransportContext.signal} aborts. It must never loop or reconnect — retry/backoff/lifecycle
 * belong to the channel core, so a transport stays a thin per-attempt wire adapter (sse, ws, …).
 * The core builds a fresh transport per connection attempt; never a module singleton.
 */
export interface Transport {
  /** Run one connection attempt to completion; resolve on clean EOF, reject on failure/abort. */
  open(context: TransportContext): Promise<void>
}

/**
 * Constructs a {@link Transport}. A channel is configured with a factory (not a live transport) so
 * each channel — and each reconnect — gets an isolated instance with no shared mutable state.
 */
export type TransportFactory = () => Transport
