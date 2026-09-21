"use client"

import type { Notification } from "@plainworks/demo"
import { Badge } from "@plainworks/elements/badge"
import { Button } from "@plainworks/elements/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@plainworks/elements/empty"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@plainworks/elements/tabs"
import { CheckCheck, Inbox } from "lucide-react"
import { type ReactElement, type Ref, useEffect, useRef, useState } from "react"
import { Can, canManageNotifications } from "../session"
import { NotificationItem } from "./notification-item"

type FeedFilter = "all" | "unread"

/** Props for {@link NotificationsFeed}. */
export interface NotificationsFeedProps {
  /** The feed rows, newest first. */
  readonly notifications: readonly Notification[]
  /** How many rows are unread — labels the Unread tab and gates the mark-all-read control. */
  readonly unreadCount: number
  /** Whether a mark-all-read is in flight — disables the control so it cannot overlap. */
  readonly bulkPending: boolean
  /** Mark one notification read. */
  readonly onMarkRead: (notification: Notification) => void
  /** Dismiss one notification. */
  readonly onDismiss: (notification: Notification) => void
  /** Mark every unread notification read. */
  readonly onMarkAllRead: () => void
}

type NotificationAction = "mark-read" | "dismiss"

interface PendingFocus {
  readonly action: NotificationAction
  readonly rowKeys: readonly string[]
  readonly scope: FeedFilter
}

function CaughtUp({
  description,
  focusRef,
}: {
  readonly description: string
  readonly focusRef: Ref<HTMLDivElement>
}): ReactElement {
  return (
    <Empty ref={focusRef} tabIndex={-1}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Inbox aria-hidden />
        </EmptyMedia>
        <EmptyTitle>You're all caught up</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

/**
 * The notifications feed: an all/unread filter over one loaded page, a Mark all read control for an
 * authorized user, and a first-class "You're all caught up" empty state per filter. The list is a
 * semantic list of {@link NotificationItem} rows; the filter is a real tablist, so it is keyboard
 * operable and screen-reader labelled.
 */
export function NotificationsFeed({
  notifications,
  unreadCount,
  bulkPending,
  onMarkRead,
  onDismiss,
  onMarkAllRead,
}: NotificationsFeedProps): ReactElement {
  const [filter, setFilter] = useState<FeedFilter>("all")
  const unread = notifications.filter((row) => !row.read)
  const rowElements = useRef(new Map<string, HTMLLIElement>())
  const emptyElements = useRef(new Map<FeedFilter, HTMLDivElement>())
  const pendingFocus = useRef<PendingFocus>(null)

  useEffect(() => {
    const pending = pendingFocus.current
    if (pending === null) {
      return
    }
    pendingFocus.current = null
    for (const key of pending.rowKeys) {
      const row = rowElements.current.get(key)
      const matching = row?.querySelector<HTMLElement>(
        `[data-notification-action="${pending.action}"]`,
      )
      const target = matching ?? row?.querySelector<HTMLElement>("button, a[href]")
      if (target !== undefined && target !== null) {
        target.focus()
        return
      }
    }
    emptyElements.current.get(pending.scope)?.focus()
  })

  const renderList = (rows: readonly Notification[], scope: FeedFilter): ReactElement => {
    if (rows.length === 0) {
      return (
        <CaughtUp
          focusRef={(node) => {
            if (node === null) {
              emptyElements.current.delete(scope)
            } else {
              emptyElements.current.set(scope, node)
            }
          }}
          description={
            scope === "unread"
              ? "No unread notifications — everything here has been read."
              : "No notifications yet. New activity will show up here."
          }
        />
      )
    }
    return (
      <ul aria-label="Notifications" className="grid list-none gap-2">
        {rows.map((notification, index) => {
          const rowKey = `${scope}:${notification.id}`
          const nextKey =
            rows[index + 1] === undefined ? undefined : `${scope}:${rows[index + 1]?.id}`
          const previousKey =
            rows[index - 1] === undefined ? undefined : `${scope}:${rows[index - 1]?.id}`
          const prepareFocus = (action: NotificationAction, keepCurrent: boolean): void => {
            pendingFocus.current = {
              action,
              rowKeys: [
                ...(keepCurrent ? [rowKey] : []),
                ...(nextKey === undefined ? [] : [nextKey]),
                ...(previousKey === undefined ? [] : [previousKey]),
              ],
              scope,
            }
          }
          return (
            <NotificationItem
              key={notification.id}
              rowRef={(node) => {
                if (node === null) {
                  rowElements.current.delete(rowKey)
                } else {
                  rowElements.current.set(rowKey, node)
                }
              }}
              notification={notification}
              onMarkRead={(row) => {
                prepareFocus("mark-read", scope === "all")
                onMarkRead(row)
              }}
              onDismiss={(row) => {
                prepareFocus("dismiss", false)
                onDismiss(row)
              }}
            />
          )
        })}
      </ul>
    )
  }

  return (
    <Tabs
      value={filter}
      onValueChange={(value) => setFilter(value === "unread" ? "unread" : "all")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList aria-label="Filter notifications">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread" className="gap-1.5">
            Unread
            {unreadCount > 0 ? (
              <Badge variant="secondary" className="tabular-nums">
                {unreadCount}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>
        <Can authorizer={canManageNotifications} action="notifications:manage" fallback={null}>
          <Button
            variant="outline"
            size="sm"
            onClick={onMarkAllRead}
            disabled={unreadCount === 0 || bulkPending}
          >
            <CheckCheck aria-hidden />
            Mark all read
          </Button>
        </Can>
      </div>
      <TabsContent value="all">{renderList(notifications, "all")}</TabsContent>
      <TabsContent value="unread">{renderList(unread, "unread")}</TabsContent>
    </Tabs>
  )
}
