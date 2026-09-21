"use client"

import type { Notification } from "@plainworks/demo"
import { Badge } from "@plainworks/elements/badge"
import { Button } from "@plainworks/elements/button"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemMedia,
  ItemTitle,
} from "@plainworks/elements/item"
import { cn } from "@plainworks/theme"
import { DateValue } from "@plainworks/ui/display"
import { Check, X } from "lucide-react"
import type { ReactElement, Ref } from "react"
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from "../../app/constants"
import { Can, canManageNotifications } from "../session"
import { NOTIFICATION_TYPE_META } from "./notification-fields"

/** Props for {@link NotificationItem}. */
export interface NotificationItemProps {
  /** The notification to render. */
  readonly notification: Notification
  /** Mark this notification read. */
  readonly onMarkRead: (notification: Notification) => void
  /** Dismiss this notification. */
  readonly onDismiss: (notification: Notification) => void
  /** Ref used by the feed to restore focus after an optimistic row removal. */
  readonly rowRef?: Ref<HTMLLIElement>
}

/**
 * One feed row: the type icon, an unread emphasis that never relies on colour alone (a dot with an
 * "Unread" label, plus a heavier title), the title and message, a type badge and the timestamp, and
 * the act-on controls. An authorized user gets Mark read (only while unread) and Dismiss; a guest
 * sees the row without the controls. Rendered as a list item so the feed is a semantic list.
 */
export function NotificationItem({
  notification,
  onMarkRead,
  onDismiss,
  rowRef,
}: NotificationItemProps): ReactElement {
  const meta = NOTIFICATION_TYPE_META[notification.type]
  const Icon = meta.icon
  const unread = !notification.read
  return (
    <Item
      render={<li ref={rowRef} />}
      variant={unread ? "muted" : "outline"}
      className="items-start gap-3"
    >
      <ItemMedia variant="icon" className="text-muted-foreground">
        <Icon aria-hidden />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className={cn("gap-2", unread ? "font-semibold" : "font-medium")}>
          {unread ? (
            <span className="inline-flex items-center gap-1.5 text-primary">
              <span aria-hidden className="size-2 rounded-full bg-primary" />
              <span className="sr-only">Unread. </span>
            </span>
          ) : null}
          <span className={unread ? undefined : "text-muted-foreground"}>{notification.title}</span>
        </ItemTitle>
        <ItemDescription>{notification.message}</ItemDescription>
        <ItemFooter className="justify-start gap-2 text-muted-foreground text-xs">
          <Badge variant={meta.tone}>{meta.label}</Badge>
          <DateValue
            value={notification.createdAt}
            locale={DISPLAY_LOCALE}
            timeZone={DISPLAY_TIME_ZONE}
            options={{ dateStyle: "medium", timeStyle: "short" }}
          />
        </ItemFooter>
      </ItemContent>
      <Can authorizer={canManageNotifications} action="notifications:manage" fallback={null}>
        <ItemActions className="self-center">
          {unread ? (
            <Button
              variant="ghost"
              size="sm"
              data-notification-action="mark-read"
              onClick={() => onMarkRead(notification)}
            >
              <Check aria-hidden />
              Mark read
              <span className="sr-only"> — {notification.title}</span>
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            data-notification-action="dismiss"
            aria-label={`Dismiss notification: ${notification.title}`}
            onClick={() => onDismiss(notification)}
          >
            <X aria-hidden />
          </Button>
        </ItemActions>
      </Can>
    </Item>
  )
}
