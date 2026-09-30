import { createScheduledStream } from "@plainworks/mocks/stream"
import type { StreamFrame, StreamTransportFactory } from "@plainworks/std/seam"

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
  return { type: "task.upserted", data: JSON.stringify(data) }
}

/**
 * The demo live-task stream, standing in for a real SSE/WS backend: one {@link demoTaskFrame}
 * every `intervalMs`, built on the `@plainworks/mocks` scheduled stream. Swapping in
 * `createSseTransport` later changes nothing above it.
 */
export function createDemoTransport(intervalMs = 2500): StreamTransportFactory {
  return createScheduledStream({ intervalMs, frame: demoTaskFrame })
}
