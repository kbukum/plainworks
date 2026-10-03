import { TASK_PRIORITIES, type Task } from "@plainworks/demo"
import { TaskChangedSchema } from "@plainworks/demo/events"
import type { HttpClient } from "@plainworks/http"
import { createScheduledStream } from "@plainworks/mocks/stream"
import type { StreamFrame, StreamTransportFactory } from "@plainworks/std/seam"
import { type Clock, systemClock } from "@plainworks/std/time"
import { taskList } from "../../neutral/lists"
import { TASK_STATUSES } from "../../neutral/tasks"

const LIVE_TITLES = [
  "Draft the release notes",
  "Review the auth flow",
  "Triage inbound issues",
  "Prepare the launch demo",
  "Update the changelog",
] as const

/** A complete generated-message payload for the demo task event. */
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
  return { type: TaskChangedSchema.typeName, data: JSON.stringify(task) }
}

/**
 * Change a real demo task before announcing it, so subsequent list snapshots see the same state.
 * An empty backend produces no event until tasks exist again.
 */
export function createDemoTaskStream(
  client: HttpClient,
  intervalMs = 4000,
): StreamTransportFactory {
  return createScheduledStream({
    intervalMs,
    epoch: "00000000000000000000000000000001",
    frame: async (seq, signal) => {
      const page = await taskList.read(client, { page: 1, pageSize: 5 }, signal)
      const task = page.data[(seq - 1) % page.data.length]
      if (task === undefined) return undefined
      const title = `${LIVE_TITLES[seq % LIVE_TITLES.length]} #${seq}`
      await client.patch(`/api/tasks/${task.id}`, { body: { title }, signal })
      return { type: TaskChangedSchema.typeName, data: JSON.stringify({ ...task, title }) }
    },
  })
}
