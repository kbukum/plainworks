import { TASK_PRIORITIES, type Task } from "@plainworks/demo"
import { createScheduledStream } from "@plainworks/mocks/stream"
import type { StreamFrame, StreamTransportFactory } from "@plainworks/std/seam"
import { type Clock, systemClock } from "@plainworks/std/time"
import { TASK_STATUSES } from "../../neutral/tasks"
import { LIVE_EVENT } from "./live-tasks"

const LIVE_TITLES = [
  "Draft the release notes",
  "Review the auth flow",
  "Triage inbound issues",
  "Prepare the launch demo",
  "Update the changelog",
] as const

/** The full `task.upserted` frame the demo stream sends on tick `seq`. */
export function demoTaskFrame(seq: number, clock: Clock = systemClock): StreamFrame {
  const slot = seq % LIVE_TITLES.length
  const now = new Date(clock.now()).toISOString()
  const task: Task = {
    id: `live-${slot}`,
    title: `${LIVE_TITLES[slot]} #${seq}`,
    status: TASK_STATUSES[seq % TASK_STATUSES.length] as Task["status"],
    priority: TASK_PRIORITIES[seq % TASK_PRIORITIES.length] ?? "medium",
    assigneeName: "Live bot",
    createdAt: now,
    updatedAt: now,
  }
  return { type: LIVE_EVENT, data: JSON.stringify(task) }
}

/**
 * The demo live-task stream, standing in for a real SSE/WS backend: one {@link demoTaskFrame}
 * every `intervalMs`, built on the `@plainworks/mocks` scheduled stream.
 */
export function createDemoTaskStream(intervalMs = 4000): StreamTransportFactory {
  return createScheduledStream({ intervalMs, frame: (seq) => demoTaskFrame(seq) })
}
