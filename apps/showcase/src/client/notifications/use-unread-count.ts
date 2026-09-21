"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { NOTIFICATION_LIST_PARAMS } from "../../app/constants"
import { notificationListPlan } from "../../app/notification-read"
import { countUnread } from "../../app/notification-shape"
import { useHttpClient } from "../http-client"

/** The unread notifications read the shell and the feed share. */
export interface UnreadCount {
  /** How many loaded notifications are unread, or unavailable before the first successful read. */
  readonly count: number | undefined
  /** `true` until the feed query has first resolved. */
  readonly isPending: boolean
  /** The read failure, or `undefined` while the latest query state is usable. */
  readonly error: unknown
}

/**
 * The unread count derived from the one notifications feed query — the single source of truth the
 * shell badge and the feed both read. Mounting it observes that shared query, so the badge stays
 * live app-wide and reuses cached data while honoring the query's freshness policy. Every act-on
 * mutation writes that same cache, so the badge updates optimistically with the feed.
 */
export function useUnreadCount(): UnreadCount {
  const httpClient = useHttpClient()
  const query = useQuery({
    ...notificationListPlan(httpClient, NOTIFICATION_LIST_PARAMS),
    placeholderData: keepPreviousData,
  })
  const count = query.data === undefined ? undefined : countUnread(query.data.data)
  return { count, isPending: query.isPending, error: query.isError ? query.error : undefined }
}
