"use client"

// Re-export-only barrel for the notifications concern — the read/act feed section, its optimistic
// act-on mutations, the unread-count read the shell shares, and the shell's unread indicator.
export type { NotificationMutations } from "./notification-mutations"
export { useNotificationMutations } from "./notification-mutations"
export { NotificationsBell } from "./notifications-bell"
export { NotificationsSection } from "./notifications-section"
export type { UnreadCount } from "./use-unread-count"
export { useUnreadCount } from "./use-unread-count"
