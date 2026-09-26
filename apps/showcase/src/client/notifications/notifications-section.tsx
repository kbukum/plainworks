"use client"

import type { Notification } from "@plainworks/demo"
import { asyncStatus } from "@plainworks/ui"
import { AsyncState, ErrorState, LoadingState } from "@plainworks/ui/feedback"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import type { ReactElement } from "react"
import { NOTIFICATION_LIST_PARAMS } from "../../app/constants"
import { notificationListPlan } from "../../app/notification-read"
import { countUnread } from "../../app/notification-shape"
import { useToast } from "../feedback"
import { useHttpClient } from "../http-client"
import { useNotificationMutations } from "./notification-mutations"
import { NotificationsFeed } from "./notifications-feed"

/**
 * The Notifications section: a server-prefetched, hydrated read/act feed. It reads one page of
 * notifications, splits them all/unread, and lets an authorized user mark read, dismiss, and mark
 * all read — each an optimistic, rolled-back-on-failure mutation that raises a toast. The shell's
 * unread badge reads this same cache, so the two never drift. The initial request mirrors the SSR
 * prefetch, so the first paint uses the hydrated feed without a loading flash.
 */
export function NotificationsSection(): ReactElement {
  const httpClient = useHttpClient()
  const toast = useToast()
  const plan = notificationListPlan(httpClient, NOTIFICATION_LIST_PARAMS)
  const query = useQuery({ ...plan, placeholderData: keepPreviousData })
  const mutations = useNotificationMutations(plan.queryKey)

  const rows = query.data?.data ?? []
  const unreadCount = countUnread(rows)

  const handleMarkRead = (notification: Notification): void => {
    void mutations.markRead(notification).then((outcome) => {
      if (outcome === "success") {
        toast.success("Marked as read")
      } else if (outcome === "failure") {
        toast.error("That notification could not be updated")
      }
    })
  }
  const handleDismiss = (notification: Notification): void => {
    void mutations.dismiss(notification).then((outcome) => {
      if (outcome === "success") {
        toast.success("Notification dismissed")
      } else if (outcome === "failure") {
        toast.error("That notification could not be dismissed")
      }
    })
  }
  const handleMarkAllRead = (): void => {
    void mutations.markAllRead().then((outcome) => {
      if (outcome === "success") {
        toast.success("All notifications marked read")
      } else if (outcome === "failure") {
        toast.error("Notifications could not be marked read")
      }
    })
  }

  return (
    <AsyncState
      status={asyncStatus({ pending: query.isPending, error: query.isError })}
      loading={<LoadingState label="Loading notifications" lines={6} />}
      error={
        <ErrorState
          title="Notifications are unavailable"
          description="The notifications feed could not be loaded."
          onRetry={() => void query.refetch()}
        />
      }
    >
      <NotificationsFeed
        notifications={rows}
        unreadCount={unreadCount}
        bulkPending={mutations.isBulkPending}
        onMarkRead={handleMarkRead}
        onDismiss={handleDismiss}
        onMarkAllRead={handleMarkAllRead}
      />
    </AsyncState>
  )
}
