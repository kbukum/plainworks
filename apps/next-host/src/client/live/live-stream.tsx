"use client"

import { createChannelContext } from "@plainworks/channel/client"
import { createEventRouter, protobufDecoder } from "@plainworks/channel/events"
import { Button } from "@plainworks/elements/button"
import { createLiveQuery, type LiveQuery, type LiveQueryStatus } from "@plainworks/query/cache"
import { createSourceReconciler, type StateSource } from "@plainworks/std/seam"
import type { WebAbortSignal } from "@plainworks/std/web"
import { useQueryClient } from "@tanstack/react-query"
import { type ReactElement, type ReactNode, useEffect, useRef, useState } from "react"
import { LIVE_TASKS_SLOT_KEY } from "../../neutral/constants"
import { TaskChangedSchema } from "../../neutral/live/events_pb"

/** The live-tasks slot shape: last-write-wins by id, so redelivery is idempotent. */
export type LiveTasks = Record<string, string>

// One channel React binding for the app. `createChannelContext` builds a React context and hooks;
// the Provider owns a fresh per-mount channel (no module-level singleton — the channel itself is
// built inside the Provider), so this shared context object is safe at module scope.
const channel = createChannelContext()

/** The channel Provider — connect on mount, tear down on unmount. */
export const LiveChannelProvider = channel.ChannelProvider

/** Read the live channel built by {@link LiveChannelProvider}; used to observe it in development. */
export const useLiveChannel = channel.useChannel

/** Props for {@link LiveTaskSink}. */
export interface LiveTaskSinkProps {
  /** Authoritative, abortable snapshot; the kit owns its fetch and recovery budget. */
  readonly snapshot: (signal: WebAbortSignal) => Promise<LiveTasks>
  readonly children: ReactNode
}

/**
 * Decode generated events and invalidate the owned snapshot. Scoped state observes that same
 * Query entry, including resets, rather than keeping a second copy or overlaying event deltas.
 */
export function LiveTaskSink({ snapshot, children }: LiveTaskSinkProps): ReactElement {
  const liveChannel = channel.useChannel()
  const queryClient = useQueryClient()
  const [snapshotError, setSnapshotError] = useState<string>()
  const [channelError, setChannelError] = useState<string>()
  const [status, setStatus] = useState<LiveQueryStatus>("waiting")
  const owner = useRef<LiveQuery | undefined>(undefined)

  useEffect(() => {
    const live = createLiveQuery(queryClient, {
      queryKey: [LIVE_TASKS_SLOT_KEY],
      queryFn: ({ signal }) => snapshot(signal),
    })
    owner.current = live
    setStatus(live.status)
    setSnapshotError(undefined)
    setChannelError(undefined)
    const subscription = live.subscribe(() => {
      setStatus(live.status)
      setSnapshotError(live.error?.message)
      if (live.status === "fresh") setChannelError(undefined)
    })
    const router = createEventRouter({
      channel: liveChannel,
      decode: protobufDecoder(TaskChangedSchema),
      sinks: [live],
      onError: (failure) => setChannelError(failure.message),
    })
    return () => {
      subscription.unsubscribe()
      router.close()
      owner.current = undefined
    }
  }, [liveChannel, queryClient, snapshot])

  const error = channelError ?? snapshotError
  return (
    <>
      {error === undefined ? null : (
        <div role="alert">
          <p>{error}</p>
          {status === "closed" ? null : (
            <Button variant="outline" onClick={() => owner.current?.refresh()}>
              Refresh live data
            </Button>
          )}
        </div>
      )}
      {children}
    </>
  )
}

/** Result returned by {@link useLiveTasks}. */
export interface UseLiveTasksResult {
  /** The live tasks map. */
  readonly tasks: LiveTasks
  /** Any non-cancellation read error encountered while reading the source. */
  readonly error?: unknown
}

/** Options for {@link useLiveTasks}. */
export interface UseLiveTasksOptions {
  /** When true, pauses adopting source updates into component state. */
  readonly paused?: boolean
  /** Callback invoked when source reconciliation encounters an error. */
  readonly onReconcileError?: (error: unknown) => void
}

/**
 * Read the live-tasks slot reactively. Starts empty on the server and on the first client render
 * (so the markup matches), then reconciles the source on every change the stream drives using the
 * shared {@link createSourceReconciler} seam. Surfaces reconciliation errors in component state so
 * a failing source never leaves the view silently stale.
 */
export function useLiveTasks(
  source: StateSource<LiveTasks>,
  options: UseLiveTasksOptions = {},
): UseLiveTasksResult {
  const { paused = false, onReconcileError } = options
  const [tasks, setTasks] = useState<LiveTasks>({})
  const [error, setError] = useState<unknown | undefined>(undefined)

  useEffect(() => {
    let unmounted = false
    const reconciler = createSourceReconciler<LiveTasks>({
      source,
      adopt: (next) => {
        if (!unmounted && !paused) {
          setTasks(next)
          setError(undefined)
        }
      },
      reset: () => {
        if (!unmounted && !paused) {
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
  }, [source, paused, onReconcileError])

  return { tasks, error }
}
