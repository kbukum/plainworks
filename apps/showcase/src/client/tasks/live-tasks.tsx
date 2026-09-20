"use client"

import { createChannelContext } from "@plainworks/channel/client"
import type { Task } from "@plainworks/demo"
import { Button } from "@plainworks/elements/button"
import type { ListQueryParams } from "@plainworks/query"
import { type PaginatedResult, writeQueryData } from "@plainworks/query"
import type { StreamFrame } from "@plainworks/std"
import type { QueryKey } from "@tanstack/react-query"
import { useQueryClient } from "@tanstack/react-query"
import { type ReactElement, useState } from "react"
import { reconcileTaskInPage } from "../../app/task-page"
import { isTask } from "../../app/task-shape"

/** The live task event this stream carries: a full, validated task upsert. */
export const LIVE_EVENT = "task.upserted"

// One channel React binding for the Tasks section. The Provider owns a fresh per-mount channel (no
// module-level singleton — the channel is built inside the Provider), so this shared context object
// is safe at module scope and two concurrent SSR requests stay isolated.
const channel = createChannelContext()

/** The channel Provider — connects the injected transport on mount, tears it down on unmount. */
export const LiveTaskChannelProvider = channel.ChannelProvider

/** Decode an untrusted frame into a validated {@link Task}, dropping anything malformed. */
function decodeLiveTask(frame: StreamFrame): Task | undefined {
  if (frame.type !== LIVE_EVENT) {
    return undefined
  }
  let payload: unknown
  try {
    payload = JSON.parse(frame.data)
  } catch {
    return undefined
  }
  return isTask(payload) ? payload : undefined
}

/** Props for {@link LiveTaskFold}. */
export interface LiveTaskFoldProps {
  /** The active list key a streamed upsert folds into — the exact page the table renders. */
  readonly queryKey: QueryKey
  /** The active list query params, ensuring only matching page 1 tasks prepend. */
  readonly params?: ListQueryParams
  /** When false, live streaming updates are paused. */
  readonly enabled?: boolean
}

/**
 * Fold each streamed `task.upserted` into the active list cache. Safe page-one inserts and existing
 * rows update immediately; uncertain filter, sort, or pagination changes also invalidate the query
 * for a server-authoritative refresh. When paused, events are ignored and live regions stay quiet.
 */
export function LiveTaskFold({
  queryKey,
  params,
  enabled = true,
}: LiveTaskFoldProps): ReactElement {
  const queryClient = useQueryClient()
  const [latest, setLatest] = useState<string>()

  channel.useChannelEvent(LIVE_EVENT, (frame) => {
    if (!enabled) {
      return
    }
    const task = decodeLiveTask(frame)
    if (task === undefined) {
      return
    }
    const page = queryClient.getQueryData<PaginatedResult<Task>>(queryKey)
    if (page === undefined) {
      void queryClient.invalidateQueries({ queryKey })
      setLatest(task.title)
      return
    }
    let requiresRefetch = false
    writeQueryData<PaginatedResult<Task>>(queryClient, queryKey, (page) => {
      const result = reconcileTaskInPage(page, task, params ?? {}, "upsert")
      requiresRefetch = result.requiresRefetch
      return result.page
    })
    if (requiresRefetch) {
      void queryClient.invalidateQueries({ queryKey })
    }
    setLatest(task.title)
  })

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
