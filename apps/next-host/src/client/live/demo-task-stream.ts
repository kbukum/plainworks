import { createScheduledStream } from "@plainworks/mocks/stream"
import { AbortError } from "@plainworks/std/resilience"
import type { StreamFrame, StreamTransportFactory } from "@plainworks/std/seam"
import type { WebAbortSignal } from "@plainworks/std/web"
import { TaskChangedSchema } from "../../neutral/live/events_pb"

const LIVE_TITLES = [
  "Draft the release notes",
  "Review the auth flow",
  "Triage inbound issues",
  "Prepare the launch demo",
  "Update the changelog",
] as const

/** The `task.upserted` frame the demo stream sends on tick `seq`; ids cycle over a few slots. */
export function demoTaskFrame(seq: number): StreamFrame {
  const slot = seq % LIVE_TITLES.length
  const data = { id: `live-${slot}`, title: `${LIVE_TITLES[slot]} #${seq}` }
  return { type: TaskChangedSchema.typeName, data: JSON.stringify(data) }
}

/**
 * The demo live-task stream, standing in for a real SSE/WS backend: one {@link demoTaskFrame}
 * every `intervalMs`, built on the `@plainworks/mocks` scheduled stream. Swapping in
 * `createSseTransport` later changes nothing above it.
 */
export function createDemoTasks(intervalMs = 2500): {
  readonly transport: StreamTransportFactory
  readonly snapshot: (signal: WebAbortSignal) => Promise<Record<string, string>>
} {
  const tasks: Record<string, string> = {}
  return {
    transport: createScheduledStream({
      intervalMs,
      epoch: "00000000000000000000000000000001",
      frame: (seq) => {
        const slot = seq % LIVE_TITLES.length
        tasks[`live-${slot}`] = `${LIVE_TITLES[slot]} #${seq}`
        return demoTaskFrame(seq)
      },
    }),
    snapshot: async (signal) => {
      if (signal.aborted) throw new AbortError({ cause: signal.reason })
      return { ...tasks }
    },
  }
}
