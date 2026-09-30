"use client"

import type { Notification } from "@plainworks/demo"
import { useHttpClient } from "@plainworks/http/client"
import { optimisticMutationOptions } from "@plainworks/query/mutation"
import { type QueryKey, useMutation } from "@tanstack/react-query"
import { useCallback, useState } from "react"
import {
  dismissNotification,
  markAllNotificationsRead,
  markEveryNotificationRead,
  markNotificationRead,
  type NotificationPage,
  removeNotificationFromPage,
  replaceNotificationInPage,
} from "../../neutral/notifications"

/** The notification act-on mutations bound to the feed under one query key, plus the last failure. */
export interface NotificationMutations {
  /** Mark one notification read optimistically; resolves `true` on success. */
  readonly markRead: (notification: Notification) => Promise<boolean>
  /** Dismiss one notification optimistically; resolves `true` on success. */
  readonly dismiss: (notification: Notification) => Promise<boolean>
  /** Mark every unread notification read in one request; resolves `true` on success. */
  readonly markAllRead: () => Promise<boolean>
  /** `true` while a mark-all-read is in flight — drive the disabled control from it. */
  readonly isBulkPending: boolean
  /** The last mutation failure, or `undefined` — surfaced as a typed error, never swallowed. */
  readonly error: unknown
  /** Clear the surfaced error. */
  readonly clearError: () => void
}

/**
 * The optimistic act-on mutations for the notifications feed under `queryKey`. Each shows the
 * change at once, performs the real request, and rolls back on failure. The writes share one
 * mutation key, so the feed re-syncs from the server once, after every overlapping write settles.
 */
export function useNotificationMutations(queryKey: QueryKey): NotificationMutations {
  const httpClient = useHttpClient()
  const [error, setError] = useState<unknown>(undefined)

  const { mutateAsync: markReadAsync } = useMutation(
    optimisticMutationOptions<unknown, Notification, NotificationPage>({
      queryKey,
      mutationFn: (notification) => markNotificationRead(httpClient, notification.id),
      apply: (page, notification) =>
        replaceNotificationInPage(page, { ...notification, read: true }),
    }),
  )
  const { mutateAsync: dismissAsync } = useMutation(
    optimisticMutationOptions<unknown, Notification, NotificationPage>({
      queryKey,
      mutationFn: (notification) => dismissNotification(httpClient, notification.id),
      apply: (page, notification) => removeNotificationFromPage(page, notification.id),
    }),
  )
  const bulk = useMutation(
    optimisticMutationOptions<unknown, void, NotificationPage>({
      queryKey,
      mutationFn: () => markAllNotificationsRead(httpClient),
      apply: (page) => markEveryNotificationRead(page),
    }),
  )
  const { mutateAsync: markAllAsync } = bulk

  const settle = useCallback(
    (write: Promise<unknown>): Promise<boolean> =>
      write.then(
        () => {
          setError(undefined)
          return true
        },
        (cause: unknown) => {
          setError(cause)
          return false
        },
      ),
    [],
  )

  const markRead = useCallback(
    (notification: Notification): Promise<boolean> =>
      notification.read ? Promise.resolve(true) : settle(markReadAsync(notification)),
    [markReadAsync, settle],
  )
  const dismiss = useCallback(
    (notification: Notification): Promise<boolean> => settle(dismissAsync(notification)),
    [dismissAsync, settle],
  )
  const markAllRead = useCallback(
    (): Promise<boolean> => settle(markAllAsync()),
    [markAllAsync, settle],
  )
  const clearError = useCallback(() => setError(undefined), [])

  return { markRead, dismiss, markAllRead, isBulkPending: bulk.isPending, error, clearError }
}
