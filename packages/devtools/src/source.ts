import type { WebAbortSignal } from "@plainworks/std"
import type { Json } from "./privacy"
import type { CommandDescriptor, SourceEvent, SourceId, StatusIndicator } from "./protocol"

/**
 * The sink a source publishes into. Given to a source once, when it is registered. Calls are cheap
 * and synchronous; the session sanitizes, orders, retains, and forwards on the source's behalf.
 */
export interface SourceObserver {
  /** Publish a summary event. The session assigns its sequence and retains it. */
  emit(event: SourceEvent): void
  /** Publish or replace a compact status indicator for the diagnostics rail. */
  indicate(indicator: StatusIndicator): void
  /** Report a source-local failure. It is isolated: other sources keep running. */
  fail(error: unknown): void
}

/**
 * The live side of a connected source, returned from {@link Source.connect}. Detail and command
 * resolution are optional — a read-only source that exposes neither is the default. Both receive an
 * {@link @plainworks/std!WebAbortSignal} so the session can cancel a request or tear the source
 * down.
 */
export interface SourceHandle {
  /** Resolve the full, expensive detail for an event's `detail` token. */
  resolveDetail?(ref: string, signal: WebAbortSignal): Promise<unknown>
  /** Run an advertised command with already-validated serializable input. */
  runCommand?(commandId: string, input: Json, signal: WebAbortSignal): Promise<unknown>
  /** Release every resource the source owns. Called once, on deregistration or disposal. */
  dispose(): void
}

/**
 * Something the panel can observe. It carries a stable identity and label, advertises any commands,
 * and begins publishing when connected. A source describes *what* can be observed, never how it is
 * rendered — no React or host type ever appears here.
 */
export interface Source {
  readonly id: SourceId
  readonly label: string
  readonly commands?: readonly CommandDescriptor[]
  /** Begin publishing to `observer`; return the live handle. Called once, on registration. */
  connect(observer: SourceObserver, signal: WebAbortSignal): SourceHandle
}
