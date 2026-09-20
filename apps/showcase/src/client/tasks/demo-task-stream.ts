import { TASK_PRIORITIES, type Task } from "@plainworks/demo"
import {
  AbortError,
  type StreamFrame,
  type StreamTransport,
  type StreamTransportFactory,
} from "@plainworks/std"
import { TASK_STATUSES } from "../../app/task-shape"
import { LIVE_EVENT } from "./live-tasks"

const LIVE_TITLES = [
  "Draft the release notes",
  "Review the auth flow",
  "Triage inbound issues",
  "Prepare the launch demo",
  "Update the changelog",
] as const

/**
 * An app-local demo {@link StreamTransportFactory} standing in for a real SSE/WS backend: on open
 * it emits a full `task.upserted` frame every `intervalMs` and tears its timer down when the
 * channel aborts the attempt (close/unmount). It speaks only the published `channel` transport seam
 * a real adapter would, so swapping in an SSE transport later changes nothing above it.
 */
export function createDemoTaskStream(intervalMs = 4000): StreamTransportFactory {
  return () => {
    const transport: StreamTransport = {
      open(context) {
        return new Promise<void>((_resolve, reject) => {
          if (context.signal.aborted) {
            reject(new AbortError({ cause: context.signal.reason }))
            return
          }
          context.onOpen()
          let seq = 0
          const timer = setInterval(() => {
            seq += 1
            const slot = seq % LIVE_TITLES.length
            const now = new Date().toISOString()
            const task: Task = {
              id: `live-${slot}`,
              title: `${LIVE_TITLES[slot]} #${seq}`,
              status: TASK_STATUSES[seq % TASK_STATUSES.length] as Task["status"],
              priority: TASK_PRIORITIES[seq % TASK_PRIORITIES.length] ?? "medium",
              assigneeName: "Live bot",
              createdAt: now,
              updatedAt: now,
            }
            const frame: StreamFrame = {
              type: LIVE_EVENT,
              data: JSON.stringify(task),
              id: String(seq),
            }
            context.onFrame(frame)
          }, intervalMs)
          context.signal.addEventListener(
            "abort",
            () => {
              clearInterval(timer)
              reject(new AbortError({ cause: context.signal.reason }))
            },
            { once: true },
          )
        })
      },
    }
    return transport
  }
}
