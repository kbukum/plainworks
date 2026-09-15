import {
  AbortError,
  type StreamFrame,
  type StreamTransport,
  type StreamTransportContext,
  type StreamTransportFactory,
} from "@plainworks/std"

/**
 * One connection attempt captured from a {@link fakeStreamTransport}: the
 * {@link StreamTransportContext} the stream consumer handed it, plus manual controls to drive the
 * wire — mark it open, push frames, end it cleanly, or fail it — so a test scripts a stream step by
 * step with no real network or timer.
 */
export interface FakeStreamAttempt {
  /** The context the stream consumer supplied for this attempt. */
  readonly context: StreamTransportContext
  /** Fire `onOpen` — the connection is now established. */
  open(): void
  /** Deliver one decoded frame via `onFrame`. To script a malformed frame, pass invalid `data`. */
  frame(frame: StreamFrame): void
  /** End the stream cleanly (server EOF): resolves the attempt's `open()`. */
  endOk(): void
  /** Fail the stream: rejects the attempt's `open()` with `error` (a mid-stream drop). */
  endError(error: unknown): void
  /** Whether the attempt's signal has aborted (connect/idle timeout or caller close). */
  readonly aborted: boolean
  /** Whether the attempt has settled (ended or failed). */
  readonly settled: boolean
}

/**
 * A network-free {@link StreamTransportFactory} whose every connection attempt is driven manually
 * by the test. Hand `factory` to `createChannel({ transport })` (or any stream consumer), then step
 * each attempt through the sequence under test — ordered frames, a mid-stream drop, a reconnect
 * whose `context.lastEventId` proves header-only resume, a burst that backpressures a slow sink, or
 * a malformed frame — asserting against `attempts` as you go. Timing comes from the consumer's own
 * injected clock/delay doubles, so a test never waits on real time.
 */
export interface FakeStreamTransport {
  /** Pass this to `createChannel({ transport })`. */
  readonly factory: StreamTransportFactory
  /** Every attempt made so far, in order. */
  readonly attempts: readonly FakeStreamAttempt[]
  /** The most recent attempt, or `undefined` before the first connect. */
  readonly current: FakeStreamAttempt | undefined
  /**
   * Assert the transport is fully torn down: every attempt has either settled or been aborted by
   * the consumer. Throws if any attempt is still live (opened and never ended, its signal never
   * aborted) — the leaked-stream bug class this double exists to catch. Call it after the code
   * under test is supposed to have closed, so a forgotten `close()` fails loudly instead of
   * passing.
   */
  assertClosed(): void
}

/**
 * Build a {@link FakeStreamTransport}. A single shared {@link StreamTransport} instance records
 * each `open()` call as a {@link FakeStreamAttempt}; when the attempt's signal aborts, its `open()`
 * promise rejects with an {@link AbortError} (as a real transport does), so the consumer's
 * reconnect and close paths are exercised. Its abort listener is removed on settle, so a completed
 * attempt leaves nothing attached to the signal.
 */
export function fakeStreamTransport(): FakeStreamTransport {
  const attempts: FakeStreamAttempt[] = []

  const transport: StreamTransport = {
    open(context: StreamTransportContext): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        let settled = false
        const onAbort = (): void =>
          settle(() => reject(new AbortError({ cause: context.signal.reason })))
        const settle = (run: () => void): void => {
          if (!settled) {
            settled = true
            context.signal.removeEventListener("abort", onAbort)
            run()
          }
        }
        const attempt: FakeStreamAttempt = {
          context,
          open: () => {
            requireLive("open")
            context.onOpen()
          },
          frame: (frame) => {
            requireLive("frame")
            context.onFrame(frame)
          },
          endOk: () => settle(resolve),
          endError: (error) => settle(() => reject(error)),
          get aborted() {
            return context.signal.aborted
          },
          get settled() {
            return settled
          },
        }
        // A real transport emits no `onOpen`/`onFrame` once the attempt has ended, failed, or
        // aborted; driving a settled attempt is always a test mistake, so fail it loudly rather
        // than let the double mask a "frame after close" consumer bug.
        const requireLive = (action: string): void => {
          if (settled) {
            throw new Error(`fakeStreamTransport: ${action}() called after the attempt settled`)
          }
        }
        if (context.signal.aborted) {
          settle(() => reject(new AbortError({ cause: context.signal.reason })))
        } else {
          context.signal.addEventListener("abort", onAbort, { once: true })
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
    assertClosed() {
      const leaked = attempts.filter((attempt) => !attempt.settled && !attempt.aborted)
      if (leaked.length > 0) {
        throw new Error(
          `fakeStreamTransport: ${leaked.length} attempt(s) left open (never ended and signal never aborted) — the stream consumer leaked a subscription or timer. Close the consumer before asserting.`,
        )
      }
    },
  }
}
