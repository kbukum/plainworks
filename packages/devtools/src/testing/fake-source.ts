import type { WebAbortSignal } from "@plainworks/std"
import type { Json } from "../privacy"
import type { SourceEvent, SourceId, StatusIndicator } from "../protocol"
import type { Source, SourceHandle, SourceObserver } from "../source"

/**
 * Scripted behavior for a {@link fakeSource}. Every callback is optional; an absent detail
 * resolver or command runner makes the source read-only for that concern, like a real one.
 */
export interface FakeSourceScript {
  readonly label?: string
  readonly commands?: Source["commands"]
  /** Resolve a detail ref; may throw or return a rejecting promise to script failures. */
  readonly resolveDetail?: (ref: string, signal?: WebAbortSignal) => unknown
  /** Run a command; may throw or return a rejecting promise to script failures. */
  readonly runCommand?: (commandId: string, input: Json, signal?: WebAbortSignal) => unknown
  /** Set to throw synchronously from `connect`, scripting a source that fails on registration. */
  readonly connectError?: unknown
}

/** The live controls a test drives after registering a {@link fakeSource}. */
export interface FakeSourceControls {
  /** Publish an event through the source's observer. */
  emit(event: SourceEvent): void
  /** Publish or replace an indicator. */
  indicate(indicator: StatusIndicator): void
  /** Report a source-local failure. */
  fail(error: unknown): void
  /** Whether the session has disposed the source's handle. */
  readonly disposed: boolean
}

export type FakeSource = Source & FakeSourceControls

/**
 * A scripted {@link Source} for tests: `connect` captures the observer so the test publishes
 * events, indicators, and failures exactly as a real adapter would. No timers, no DOM.
 */
export function fakeSource(id: SourceId, script: FakeSourceScript = {}): FakeSource {
  let observer: SourceObserver | undefined
  let disposed = false
  return {
    id,
    label: script.label ?? `${id.kind}:${id.instance}`,
    ...(script.commands === undefined ? {} : { commands: script.commands }),
    connect(nextObserver, _signal) {
      if (script.connectError !== undefined) throw script.connectError
      observer = nextObserver
      const handle: SourceHandle = {
        dispose: () => {
          disposed = true
        },
      }
      if (script.resolveDetail !== undefined) {
        const resolve = script.resolveDetail
        handle.resolveDetail = (ref, signal) => Promise.resolve(resolve(ref, signal))
      }
      if (script.runCommand !== undefined) {
        const run = script.runCommand
        handle.runCommand = (commandId, input, signal) =>
          Promise.resolve(run(commandId, input, signal))
      }
      return handle
    },
    emit(event) {
      observer?.emit(event)
    },
    indicate(indicator) {
      observer?.indicate(indicator)
    },
    fail(error) {
      observer?.fail(error)
    },
    get disposed() {
      return disposed
    },
  }
}
