"use client"

import type { Notification } from "@plainworks/demo"
import { Card, CardContent, CardHeader, CardTitle } from "@plainworks/elements/card"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import type { ReactElement } from "react"
import { NOTIFICATION_LIST_PARAMS } from "../../app/constants"
import { notificationListPlan } from "../../app/notification-read"
import { countUnread } from "../../app/notification-shape"
import { SectionState, useToast } from "../feedback"
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
    <section aria-label="Notifications" className="grid gap-4">
      <p className="text-muted-foreground text-sm">
        Triage your inbox — filter to what's unread, mark items read, or dismiss what you're done
        with.
      </p>
      <Card className="min-w-0 border-border/70">
        <CardHeader className="px-4 sm:px-6">
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-4 px-4 sm:px-6">
          <SectionState
            pending={query.isPending}
            error={query.isError}
            loadingLabel="Loading notifications"
            errorTitle="Notifications are unavailable"
            errorBody="The notifications feed could not be loaded. Try again shortly."
          >
            <NotificationsFeed
              notifications={rows}
              unreadCount={unreadCount}
              bulkPending={mutations.isBulkPending}
              onMarkRead={handleMarkRead}
              onDismiss={handleDismiss}
              onMarkAllRead={handleMarkAllRead}
            />
          </SectionState>
        </CardContent>
      </Card>
    </section>
  )
}
