/**
 * Notification-related types
 */

/** A notification entity. */
export interface Notification {
  id: string
  userId: string
  type: "info" | "success" | "warning" | "error"
  title: string
  message: string
  read: boolean
  createdAt: string
}

/** Client input for creating a notification. */
export interface CreateNotificationInput {
  userId: string
  type: Notification["type"]
  title: string
  message: string
  /** Read flag override (generated randomly when omitted). */
  read?: boolean
}
