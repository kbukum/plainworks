// Re-export-only barrel for the host-neutral Notifications domain: shape guards, writes,
// authorization, and page reconciliation.
export { createNotificationMutationAuthorizer } from "./authz"
export {
  markEveryNotificationRead,
  type NotificationPage,
  removeNotificationFromPage,
  replaceNotificationInPage,
} from "./page"
export { countUnread, isNotification } from "./shape"
export { dismissNotification, markAllNotificationsRead, markNotificationRead } from "./write"
