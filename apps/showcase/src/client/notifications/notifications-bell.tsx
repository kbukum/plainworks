"use client"

import { buttonVariants } from "@plainworks/elements/button"
import { cn } from "@plainworks/theme"
import { Bell } from "lucide-react"
import type { ReactElement } from "react"
import { NOTIFICATIONS_PATH } from "../../app/navigation"
import { routerLinkRender, useRouter } from "../router"
import { useUnreadCount } from "./use-unread-count"

/**
 * The shell's unread indicator: a header control that navigates to the Notifications feed and shows
 * the unread count. The count is read from the one notifications query cache through
 * {@link useUnreadCount} — the same cache the feed mutates — so the badge updates optimistically
 * with the feed and never becomes a second source of truth. The count also rides the accessible
 * name, so it is announced, not conveyed by the badge colour alone. The badge is capped at 9+ so a
 * large inbox never overflows the control.
 */
export function NotificationsBell(): ReactElement {
  const { navigate } = useRouter()
  const { count, error } = useUnreadCount()
  const label =
    error !== undefined
      ? count === undefined
        ? "Notifications unavailable"
        : `Notifications, ${count} unread, updates unavailable`
      : count === undefined
        ? "Notifications loading"
        : count === 0
          ? "Notifications"
          : `Notifications, ${count} unread`
  const renderLink = routerLinkRender(navigate)
  return renderLink({
    href: NOTIFICATIONS_PATH,
    "aria-label": label,
    className: cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative"),
    children: (
      <>
        <Bell aria-hidden className="size-5" />
        {error !== undefined ? (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground"
          >
            !
          </span>
        ) : count !== undefined && count > 0 ? (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground tabular-nums"
          >
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </>
    ),
  })
}
