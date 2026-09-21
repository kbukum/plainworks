import type { Notification } from "@plainworks/demo"
import type { PaginatedResult } from "@plainworks/query"
import { describe, expect, it } from "vitest"
import {
  markEveryNotificationRead,
  removeNotificationFromPage,
  replaceNotificationInPage,
} from "./notification-page"

const first: Notification = {
  id: "notification-1",
  userId: "user-1",
  type: "info",
  title: "First",
  message: "First message",
  read: false,
  createdAt: "2024-01-01T00:00:00.000Z",
}

const second: Notification = {
  ...first,
  id: "notification-2",
  title: "Second",
}

const samplePage: PaginatedResult<Notification> = {
  data: [first, second],
  pagination: { page: 1, pageSize: 2, total: 3, totalPages: 2 },
}

describe("notification-page", () => {
  it("replaces an existing notification without changing pagination", () => {
    const result = replaceNotificationInPage(samplePage, { ...first, read: true })
    expect(result?.data[0]?.read).toBe(true)
    expect(result?.pagination).toEqual(samplePage.pagination)
  })

  it("removes a notification and recomputes pagination boundaries", () => {
    const result = removeNotificationFromPage(samplePage, first.id)
    expect(result?.data).toEqual([second])
    expect(result?.pagination).toEqual({ page: 1, pageSize: 2, total: 2, totalPages: 1 })
  })

  it("marks every unread notification read without changing pagination", () => {
    const result = markEveryNotificationRead(samplePage)
    expect(result?.data.every((notification) => notification.read)).toBe(true)
    expect(result?.pagination).toEqual(samplePage.pagination)
  })

  it("preserves absent pages and pages without the target notification", () => {
    expect(replaceNotificationInPage(undefined, first)).toBeUndefined()
    expect(removeNotificationFromPage(samplePage, "missing")).toBe(samplePage)
    expect(markEveryNotificationRead({ ...samplePage, data: [] })?.data).toEqual([])
  })
})
