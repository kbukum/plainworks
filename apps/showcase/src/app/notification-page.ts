import type { Notification } from "@plainworks/demo"
import type { PaginatedResult } from "@plainworks/query"

/** One cached page of notifications. */
export type NotificationPage = PaginatedResult<Notification>

/** Replace an existing notification without changing page metadata. */
export function replaceNotificationInPage(
  page: NotificationPage | undefined,
  next: Notification,
): NotificationPage | undefined {
  if (page === undefined || !page.data.some((row) => row.id === next.id)) {
    return page
  }
  return { ...page, data: page.data.map((row) => (row.id === next.id ? next : row)) }
}

/** Remove an existing notification and keep the page totals internally consistent. */
export function removeNotificationFromPage(
  page: NotificationPage | undefined,
  id: string,
): NotificationPage | undefined {
  if (page === undefined || !page.data.some((row) => row.id === id)) {
    return page
  }
  const total = Math.max(0, page.pagination.total - 1)
  return {
    ...page,
    data: page.data.filter((row) => row.id !== id),
    pagination: {
      ...page.pagination,
      total,
      totalPages: Math.ceil(total / page.pagination.pageSize),
    },
  }
}

/** Mark every unread notification in a cached page as read. */
export function markEveryNotificationRead(
  page: NotificationPage | undefined,
): NotificationPage | undefined {
  if (page === undefined || page.data.every((row) => row.read)) {
    return page
  }
  return { ...page, data: page.data.map((row) => (row.read ? row : { ...row, read: true })) }
}
