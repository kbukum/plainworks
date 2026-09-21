"use client"

import type { Notification } from "@plainworks/demo"
import { optimisticUpdate } from "@plainworks/query"
import type { QueryKey } from "@tanstack/react-query"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  markEveryNotificationRead,
  type NotificationPage,
  removeNotificationFromPage,
  replaceNotificationInPage,
} from "../../app/notification-page"
import {
  dismissNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../app/notification-write"
import { useHttpClient } from "../http-client"

/** The notification act-on mutations bound to the feed under one query key, plus the last failure. */
export interface NotificationMutations {
  /** Mark one notification read optimistically. */
  readonly markRead: (notification: Notification) => Promise<NotificationMutationResult>
  /** Dismiss one notification optimistically. */
  readonly dismiss: (notification: Notification) => Promise<NotificationMutationResult>
  /** Mark every unread notification read in one request. */
  readonly markAllRead: () => Promise<NotificationMutationResult>
  /** `true` while a mark-all-read is in flight — drive the disabled control from it. */
  readonly isBulkPending: boolean
  /** The last mutation failure, or `undefined` — surfaced as a typed error, never swallowed. */
  readonly error: unknown
  /** Clear the surfaced error. */
  readonly clearError: () => void
}

/** Outcome of a notification write, distinguishing teardown cancellation from a real failure. */
export type NotificationMutationResult = "success" | "failure" | "cancelled"

/**
 * The optimistic act-on mutations for the notifications feed under `queryKey`. Each writes the
 * change into the cache immediately, performs the real request, and rolls back on failure —
 * surfacing a typed error instead of a silent or success-shaped fallback. Active reads are
 * cancelled before each snapshot so stale data cannot overwrite the optimistic write. Once all
 * overlapping writes settle, one invalidation reconciles the cache with the server without racing
 * a newer optimistic intent. Every request carries an `AbortSignal` that fires on unmount, so an
 * in-flight write never settles onto a torn-down component.
 */
export function useNotificationMutations(queryKey: QueryKey): NotificationMutations {
  const httpClient = useHttpClient()
  const queryClient = useQueryClient()
  const [error, setError] = useState<unknown>(undefined)
  const [isBulkPending, setIsBulkPending] = useState(false)
  const [lifecycle] = useState(() => new AbortController())
  const inFlightWrites = useRef(0)
  const signal = lifecycle.signal

  useEffect(() => {
    return () => lifecycle.abort()
  }, [lifecycle])

  const clearError = useCallback(() => setError(undefined), [])

  const runOptimistic = useCallback(
    async (
      apply: (page: NotificationPage | undefined) => NotificationPage | undefined,
      request: () => Promise<unknown>,
    ): Promise<NotificationMutationResult> => {
      inFlightWrites.current += 1
      let update: ReturnType<typeof optimisticUpdate<NotificationPage>> | undefined
      try {
        await queryClient.cancelQueries({ queryKey })
        update =
          queryClient.getQueryData<NotificationPage>(queryKey) === undefined
            ? undefined
            : optimisticUpdate<NotificationPage>({ client: queryClient, queryKey, apply })
        await request()
        if (signal.aborted) {
          update?.rollback()
          return "cancelled"
        }
        setError(undefined)
        return "success"
      } catch (cause) {
        update?.rollback()
        if (signal.aborted) {
          return "cancelled"
        }
        setError(cause)
        return "failure"
      } finally {
        inFlightWrites.current -= 1
        if (inFlightWrites.current === 0) {
          await queryClient.invalidateQueries({ queryKey })
        }
      }
    },
    [queryClient, queryKey, signal],
  )

  const markRead = useCallback(
    (notification: Notification): Promise<NotificationMutationResult> => {
      if (notification.read) {
        return Promise.resolve("success")
      }
      const optimistic: Notification = { ...notification, read: true }
      return runOptimistic(
        (page) => replaceNotificationInPage(page, optimistic),
        () => markNotificationRead(httpClient, notification.id, signal),
      )
    },
    [httpClient, runOptimistic, signal],
  )

  const dismiss = useCallback(
    (notification: Notification): Promise<NotificationMutationResult> =>
      runOptimistic(
        (page) => removeNotificationFromPage(page, notification.id),
        () => dismissNotification(httpClient, notification.id, signal),
      ),
    [httpClient, runOptimistic, signal],
  )

  const markAllRead = useCallback(async (): Promise<NotificationMutationResult> => {
    setIsBulkPending(true)
    try {
      return await runOptimistic(markEveryNotificationRead, () =>
        markAllNotificationsRead(httpClient, signal),
      )
    } finally {
      if (!signal.aborted) {
        setIsBulkPending(false)
      }
    }
  }, [httpClient, runOptimistic, signal])

  return { markRead, dismiss, markAllRead, isBulkPending, error, clearError }
}
