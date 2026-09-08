import { AbortError } from "@plainworks/std"
import type { ChannelFrame, Transport, TransportContext, TransportFactory } from "./transport"

/**
 * One connection attempt captured from a {@link fakeTransport}: the {@link TransportContext} the
 * core handed it, plus manual controls to drive the wire — mark it open, push frames, end it
 * cleanly, or fail it — so a channel test steps a stream without any real network.
 *
 * Test-only harness (never bundled into `dist`; not reachable from a package entry).
 */
export interface FakeAttempt {
  /** The context the channel core supplied for this attempt. */
  readonly context: TransportContext
  /** Fire `onOpen` — the connection is now established. */
  open(): void
  /** Deliver one decoded frame via `onFrame`. */
  frame(frame: ChannelFrame): void
  /** End the stream cleanly (server EOF): resolves `open()`. */
  endOk(): void
  /** Fail the stream: rejects `open()` with `error`. */
  endError(error: unknown): void
  /** Whether the attempt's signal has aborted (connect/idle timeout or caller close). */
  readonly aborted: boolean
  /** Whether `open()` has settled (ended or failed). */
  readonly settled: boolean
}

/** A {@link TransportFactory} whose every connection attempt is driven manually by the test. */
export interface FakeTransport {
  /** Pass this to `createChannel({ transport })`. */
  readonly factory: TransportFactory
  /** Every attempt made so far, in order. */
  readonly attempts: readonly FakeAttempt[]
  /** The most recent attempt, or `undefined` before the first connect. */
  readonly current: FakeAttempt | undefined
}

/**
 * Build a {@link FakeTransport}. A single shared {@link Transport} instance records each `open()`
 * call as a {@link FakeAttempt}; when the attempt's signal aborts, its `open()` promise rejects
 * with the shared `AbortError` (as a real transport does), so the core's reconnect/close paths are
 * exercised.
 */
export function fakeTransport(): FakeTransport {
  const attempts: FakeAttempt[] = []

  const transport: Transport = {
    open(context: TransportContext): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        let settled = false
        const settle = (run: () => void): void => {
          if (!settled) {
            settled = true
            run()
          }
        }
        const attempt: FakeAttempt = {
          context,
          open: () => context.onOpen(),
          frame: (frame) => context.onFrame(frame),
          endOk: () => settle(resolve),
          endError: (error) => settle(() => reject(error)),
          get aborted() {
            return context.signal.aborted
          },
          get settled() {
            return settled
          },
        }
        if (context.signal.aborted) {
          settle(() => reject(new AbortError({ cause: context.signal.reason })))
        } else {
          context.signal.addEventListener(
            "abort",
            () => settle(() => reject(new AbortError({ cause: context.signal.reason }))),
            { once: true },
          )
        }
        attempts.push(attempt)
      })
    },
  }

  return {
    factory: () => transport,
    get attempts() {
      return attempts
    },
    get current() {
      return attempts.at(-1)
    },
  }
}
