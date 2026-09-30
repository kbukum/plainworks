import { AbortError, assertTimerMs, type Delay, systemDelay } from "@plainworks/std/resilience"
import type { StreamFrame, StreamTransport, StreamTransportFactory } from "@plainworks/std/seam"

/** Options for {@link createScheduledStream}. */
export interface ScheduledStreamOptions {
  /** Time between frames, in milliseconds. */
  readonly intervalMs: number
  /**
   * Build the frame for tick `seq` (1, 2, 3, …). A frame without an `id` gets `String(seq)`. Each
   * attempt starts again at 1 and ignores `lastEventId`.
   */
  readonly frame: (seq: number) => StreamFrame
  /** The wait between frames. Defaults to the host timer; pass a fake to drive it in a test. */
  readonly delay?: Delay
}

/**
 * A mock streaming backend: a {@link StreamTransportFactory} that opens at once, then emits one
 * frame every `intervalMs` until the channel aborts the attempt. It speaks the same transport seam
 * as the SSE and WebSocket adapters, so swapping in a real one changes nothing above it. Each
 * attempt counts from 1 again. A throwing `frame` fails the attempt with that error.
 *
 * @throws {RangeError} When `intervalMs` is not a valid timer duration.
 */
export function createScheduledStream(options: ScheduledStreamOptions): StreamTransportFactory {
  const { intervalMs, frame, delay = systemDelay } = options
  assertTimerMs(intervalMs)
  const transport: StreamTransport = {
    async open(context) {
      const { signal } = context
      if (signal.aborted) throw new AbortError({ cause: signal.reason })
      context.onOpen()
      for (let seq = 1; ; seq += 1) {
        await delay(intervalMs, signal)
        // A delay that resolves at once never yields to the abort, so check it here too.
        if (signal.aborted) throw new AbortError({ cause: signal.reason })
        const next = frame(seq)
        context.onFrame(next.id === undefined ? { ...next, id: String(seq) } : next)
      }
    },
  }
  return () => transport
}
