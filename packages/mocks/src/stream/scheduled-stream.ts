import {
  AbortError,
  assertTimerMs,
  type Delay,
  raceAbort,
  systemDelay,
} from "@plainworks/std/resilience"
import type { StreamFrame, StreamTransport, StreamTransportFactory } from "@plainworks/std/seam"
import type { WebAbortSignal } from "@plainworks/std/web"

/** Options for {@link createScheduledStream}. */
export interface ScheduledStreamOptions {
  /** Time between frames, in milliseconds. */
  readonly intervalMs: number
  /**
   * Build a frame for tick `seq`; undefined skips the tick. The sequence spans attempts. An absent
   * id uses the sequence, prefixed by the epoch when configured. The signal cancels async work.
   */
  readonly frame: (
    seq: number,
    signal: WebAbortSignal,
  ) => StreamFrame | undefined | Promise<StreamFrame | undefined>
  /** A proto-event fixture epoch. Resumed connections reset because this mock retains no replay. */
  readonly epoch?: string
  /** The wait between frames. Defaults to the host timer; pass a fake to drive it in a test. */
  readonly delay?: Delay
}

/**
 * A mock streaming backend: a {@link StreamTransportFactory} that opens at once, then emits one
 * frame every `intervalMs` until the channel aborts the attempt. It speaks the same transport seam
 * as the SSE and WebSocket adapters. Sequences span attempts, and an epoch enables connected/reset
 * controls. A throwing `frame` fails the attempt with that error.
 *
 * @throws {RangeError} When `intervalMs` is not a valid timer duration.
 */
export function createScheduledStream(options: ScheduledStreamOptions): StreamTransportFactory {
  const { intervalMs, frame, delay = systemDelay } = options
  assertTimerMs(intervalMs)
  const { epoch } = options
  if (epoch !== undefined && !/^[0-9a-f]{32}$/.test(epoch))
    throw new RangeError("Invalid stream epoch")
  let sequence = 0
  const transport: StreamTransport = {
    async open(context) {
      const { signal } = context
      if (signal.aborted) throw new AbortError({ cause: signal.reason })
      context.onOpen()
      if (epoch !== undefined) {
        const cursor = `${epoch}:${sequence}`
        if (context.lastEventId !== undefined) {
          context.onFrame({
            type: "reset",
            data: JSON.stringify({ reason: "replayExpired", cursor }),
          })
        }
        context.onFrame({ type: "connected", data: JSON.stringify({ epoch, cursor }) })
      }
      while (true) {
        await delay(intervalMs, signal)
        // A delay that resolves at once never yields to the abort, so check it here too.
        if (signal.aborted) throw new AbortError({ cause: signal.reason })
        if (sequence === Number.MAX_SAFE_INTEGER) throw new RangeError("Mock sequence exhausted")
        const seq = ++sequence
        const next = await raceAbort(Promise.resolve(frame(seq, signal)), signal)
        if (signal.aborted) throw new AbortError({ cause: signal.reason })
        if (next === undefined) continue
        context.onFrame(
          next.id === undefined
            ? { ...next, id: epoch === undefined ? String(seq) : `${epoch}:${seq}` }
            : next,
        )
      }
    },
  }
  return () => transport
}
