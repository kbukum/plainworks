"use client"

import { createChannelContext } from "@plainworks/channel/client"
import { createEventRouter, protobufDecoder } from "@plainworks/channel/events"
import type { Task } from "@plainworks/demo"
import { type TaskChanged, TaskChangedSchema } from "@plainworks/demo/events"
import { Button } from "@plainworks/elements/button"
import { createLiveQuery, type LiveQuery, type LiveQueryStatus } from "@plainworks/query/cache"
import type { ListQueryPlan } from "@plainworks/query/list"
import type { PlainEvent } from "@plainworks/std/seam"
import { useQueryClient } from "@tanstack/react-query"
import { type ReactElement, useEffect, useRef, useState } from "react"

/** The live task event this stream carries: a full, validated task upsert. */
export const LIVE_EVENT = TaskChangedSchema.typeName

// One channel React binding for the Tasks section. The Provider owns a fresh per-mount channel (no
// module-level singleton — the channel is built inside the Provider), so this shared context object
// is safe at module scope and two concurrent SSR requests stay isolated.
const channel = createChannelContext()

/** The channel Provider — connects the injected transport on mount, tears it down on unmount. */
export const LiveTaskChannelProvider = channel.ChannelProvider

/** Props for {@link LiveTaskFold}. */
export interface LiveTaskFoldProps {
  /** The active list query, fetched only by its live snapshot owner. */
  readonly plan: ListQueryPlan<Task>
  /** When false, live streaming updates are paused. */
  readonly enabled?: boolean
}

/**
 * Subscribe before fetching and invalidate on changes. The kit discards racing snapshots and
 * bounds recovery; the table never overlays a delta onto an older response.
 */
export function LiveTaskFold({ plan, enabled = true }: LiveTaskFoldProps): ReactElement {
  const queryClient = useQueryClient()
  const stream = channel.useChannel()
  const owner = useRef<LiveQuery | undefined>(undefined)
  const [latest, setLatest] = useState<string>()
  const [status, setStatus] = useState<LiveQueryStatus>("waiting")
  const [channelError, setChannelError] = useState<string>()
  useEffect(() => {
    if (!enabled) return
    const live = createLiveQuery(queryClient, plan)
    owner.current = live
    setStatus(live.status)
    setChannelError(undefined)
    const subscription = live.subscribe(() => {
      setStatus(live.status)
      if (live.status === "fresh") setChannelError(undefined)
    })
    const router = createEventRouter<PlainEvent<string, TaskChanged>>({
      channel: stream,
      decode: protobufDecoder(TaskChangedSchema),
      sinks: [live, { deliver: (event) => setLatest(event.data.title) }],
      onError: (failure) => setChannelError(failure.message),
    })
    return () => {
      subscription.unsubscribe()
      router.close()
      owner.current = undefined
    }
  }, [enabled, plan, queryClient, stream])

  if (enabled && (channelError !== undefined || status === "stale"))
    return (
      <div role="alert">
        <p>{channelError ?? "Live updates are stale."}</p>
        {status === "closed" ? null : (
          <Button variant="outline" onClick={() => owner.current?.refresh()}>
            Refresh live data
          </Button>
        )}
      </div>
    )

  return (
    <p className="sr-only" aria-live="polite">
      {!enabled || latest === undefined ? "" : `Task updated: ${latest}`}
    </p>
  )
}

/** Props for {@link LiveToggle}. */
export interface LiveToggleProps {
  /** Whether live streaming updates are currently enabled. */
  readonly enabled: boolean
  /** Callback to toggle live streaming updates on or off. */
  readonly onToggle: () => void
}

/**
 * A user-controlled pause/resume toggle for auto-updating task stream content, fulfilling
 * WCAG 2.2.2.
 */
export function LiveToggle({ enabled, onToggle }: LiveToggleProps): ReactElement {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onToggle}
      aria-pressed={enabled}
      aria-label={enabled ? "Pause live task updates" : "Resume live task updates"}
      className="gap-1.5 h-7 px-2.5 text-xs font-normal"
    >
      <span
        aria-hidden
        className={`size-2 rounded-full ${enabled ? "bg-emerald-500" : "bg-muted-foreground"}`}
      />
      {enabled ? "Live (Pause)" : "Paused (Resume)"}
    </Button>
  )
}
