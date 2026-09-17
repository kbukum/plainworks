"use client"

import {
  createEventRouter,
  createStateSink,
  type StreamFrame,
  type StreamTransport,
  type StreamTransportFactory,
} from "@plainworks/channel"
import { createChannelContext } from "@plainworks/channel/client"
import { createQueryEventSink } from "@plainworks/query"
import {
  AbortError,
  createSourceReconciler,
  isRecord,
  type PlainEvent,
  type StateSource,
} from "@plainworks/std"
import { useQueryClient } from "@tanstack/react-query"
import { type ReactElement, type ReactNode, useEffect, useState } from "react"

/** The demo event this stream carries: a task upsert with a stable id and a title. */
export type TaskEvent = PlainEvent<"task.upserted", { readonly id: string; readonly title: string }>

/** The live-tasks slot shape: last-write-wins by id, so redelivery is idempotent. */
export type LiveTasks = Record<string, string>

// One channel React binding for the app. `createChannelContext` builds a React context and hooks;
// the Provider owns a fresh per-mount channel (no module-level singleton — the channel itself is
// built inside the Provider), so this shared context object is safe at module scope.
const channel = createChannelContext()

/** The channel Provider — connect on mount, tear down on unmount. */
export const LiveChannelProvider = channel.ChannelProvider

/**
 * An app-local demo {@link StreamTransportFactory} that stands in for a real SSE/WS backend: on
 * open it emits a `task.upserted` frame every `intervalMs`, and it tears its timer down when the
 * channel aborts the attempt (close/unmount). It speaks only the published `channel` transport seam
 * a real adapter would, so swapping in `createSseTransport` later changes nothing above it.
 */
export function createDemoTransport(intervalMs = 2500): StreamTransportFactory {
  const titles = [
    "Draft the release notes",
    "Review the auth flow",
    "Triage inbound issues",
    "Prepare the launch demo",
    "Update the changelog",
  ] as const
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
            const slot = seq % titles.length
            const title = `${titles[slot]} #${seq}`
            const frame: StreamFrame = {
              type: "task.upserted",
              data: JSON.stringify({ id: `live-${slot}`, title }),
              id: String(seq),
            }
            context.onFrame(frame)
          }, intervalMs)
          const onAbort = (): void => {
            clearInterval(timer)
            reject(new AbortError({ cause: context.signal.reason }))
          }
          context.signal.addEventListener("abort", onAbort, { once: true })
        })
      },
    }
    return transport
  }
}

/** Decode an untrusted frame into a typed {@link TaskEvent}, dropping anything malformed. */
function decodeTaskEvent(frame: StreamFrame): TaskEvent | undefined {
  if (frame.type !== "task.upserted") {
    return undefined
  }
  let payload: unknown
  try {
    payload = JSON.parse(frame.data)
  } catch {
    return undefined
  }
  if (!isRecord(payload) || typeof payload.id !== "string" || typeof payload.title !== "string") {
    return undefined
  }
  return { type: "task.upserted", data: { id: payload.id, title: payload.title } }
}

/** Props for {@link LiveTaskSink}. */
export interface LiveTaskSinkProps {
  /** The memory-scope slot the stream folds task titles into. */
  readonly source: StateSource<LiveTasks>
  readonly children: ReactNode
}

/**
 * Wire the one live stream into **both** a `@plainworks/state` slot and the `@plainworks/query`
 * cache through a single {@link createEventRouter} using the unified event contract. The state sink
 * folds each upsert into the memory slot (id → title); the query sink writes the same payload under
 * `["task", id]`. Both are the one `EventSink` over the one `PlainEvent`, so they share a router
 * with no bespoke bus. The router is torn down on unmount — explicit ownership, no leak.
 */
export function LiveTaskSink({ source, children }: LiveTaskSinkProps): ReactElement {
  const liveChannel = channel.useChannel()
  const queryClient = useQueryClient()

  useEffect(() => {
    const router = createEventRouter<TaskEvent>({
      channel: liveChannel,
      decode: decodeTaskEvent,
      sinks: [
        createStateSink<TaskEvent, LiveTasks>(source, (event, current) => ({
          ...(current ?? {}),
          [event.data.id]: event.data.title,
        })),
        createQueryEventSink<TaskEvent>(queryClient, (event) => ({
          kind: "set",
          queryKey: ["task", event.data.id],
          update: event.data,
        })),
      ],
    })
    return () => router.close()
  }, [liveChannel, queryClient, source])

  return <>{children}</>
}

/** Result returned by {@link useLiveTasks}. */
export interface UseLiveTasksResult {
  /** The live tasks map. */
  readonly tasks: LiveTasks
  /** Any non-cancellation read error encountered while reading the source. */
  readonly error?: unknown
}

/**
 * Read the live-tasks slot reactively. Starts empty on the server and on the first client render
 * (so the markup matches), then reconciles the source on every change the stream drives using the
 * shared {@link createSourceReconciler} seam. Surfaces reconciliation errors in component state so
 * a failing source never leaves the view silently stale.
 */
export function useLiveTasks(
  source: StateSource<LiveTasks>,
  onReconcileError?: (error: unknown) => void,
): UseLiveTasksResult {
  const [tasks, setTasks] = useState<LiveTasks>({})
  const [error, setError] = useState<unknown | undefined>(undefined)

  useEffect(() => {
    let unmounted = false
    const reconciler = createSourceReconciler<LiveTasks>({
      source,
      adopt: (next) => {
        if (!unmounted) {
          setTasks(next)
          setError(undefined)
        }
      },
      reset: () => {
        if (!unmounted) {
          setTasks({})
          setError(undefined)
        }
      },
      report: (err) => {
        if (!unmounted) {
          setError(err)
          onReconcileError?.(err)
        }
      },
    })
    const stop = reconciler.start()
    return () => {
      unmounted = true
      stop()
    }
  }, [source, onReconcileError])

  return { tasks, error }
}
