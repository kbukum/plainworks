import type { Notification } from "@plainworks/demo"
import { createHttpClient } from "@plainworks/http"
import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { NOTIFICATION_MUTATION_HEADER, NOTIFICATION_MUTATION_HEADER_VALUE } from "./constants"
import {
  dismissNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notification-write"

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const client = createHttpClient({ baseUrl: "http://test.local" })
const notification: Notification = {
  id: "notification-1",
  userId: "user-1",
  type: "info",
  title: "Update",
  message: "Your report is ready.",
  read: true,
  createdAt: "2024-01-01T00:00:00.000Z",
}

describe("notification-write", () => {
  it("sends CSRF-resistant request proof with every mutation", async () => {
    const requestHeaders: Array<string | null> = []
    let body: unknown
    server.use(
      http.patch("http://test.local/api/notifications/:id", async ({ request }) => {
        requestHeaders.push(request.headers.get(NOTIFICATION_MUTATION_HEADER))
        body = await request.json()
        return HttpResponse.json({ data: notification })
      }),
      http.delete("http://test.local/api/notifications/:id", ({ request }) => {
        requestHeaders.push(request.headers.get(NOTIFICATION_MUTATION_HEADER))
        return HttpResponse.json({ data: { success: true } })
      }),
      http.post("http://test.local/api/notifications/read-all", ({ request }) => {
        requestHeaders.push(request.headers.get(NOTIFICATION_MUTATION_HEADER))
        return HttpResponse.json({ data: { updated: 1 } })
      }),
    )

    await expect(markNotificationRead(client, notification.id)).resolves.toEqual(notification)
    await expect(dismissNotification(client, notification.id)).resolves.toBeUndefined()
    await expect(markAllNotificationsRead(client)).resolves.toBe(1)
    expect(requestHeaders).toEqual([
      NOTIFICATION_MUTATION_HEADER_VALUE,
      NOTIFICATION_MUTATION_HEADER_VALUE,
      NOTIFICATION_MUTATION_HEADER_VALUE,
    ])
    expect(body).toEqual({ read: true })
  })

  it.each([markNotificationRead, dismissNotification])(
    "rejects dangerous notification ids before sending",
    async (write) => {
      await expect(write(client, "../settings")).rejects.toThrow("Invalid notification id")
    },
  )

  it("rejects malformed mutation envelopes", async () => {
    server.use(
      http.patch("http://test.local/api/notifications/:id", () =>
        HttpResponse.json({ data: { id: "notification-1", type: "unknown" } }),
      ),
      http.delete("http://test.local/api/notifications/:id", () =>
        HttpResponse.json({ data: { success: "yes" } }),
      ),
    )

    await expect(markNotificationRead(client, notification.id)).rejects.toThrow()
    await expect(dismissNotification(client, notification.id)).rejects.toThrow()
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5])(
    "rejects an invalid updated count of %s",
    async (updated) => {
      server.use(
        http.post("http://test.local/api/notifications/read-all", () =>
          HttpResponse.json({ data: { updated } }),
        ),
      )

      await expect(markAllNotificationsRead(client)).rejects.toThrow()
    },
  )

  it("rejects a dismissal the server did not acknowledge", async () => {
    server.use(
      http.delete("http://test.local/api/notifications/:id", () =>
        HttpResponse.json({ data: { success: false } }),
      ),
    )

    await expect(dismissNotification(client, notification.id)).rejects.toThrow(
      "response is not a successful dismissal envelope",
    )
  })

  it("rejects bodyless mutation responses", async () => {
    server.use(
      http.patch(
        "http://test.local/api/notifications/:id",
        () => new HttpResponse(null, { status: 204 }),
      ),
      http.delete(
        "http://test.local/api/notifications/:id",
        () => new HttpResponse(null, { status: 204 }),
      ),
      http.post(
        "http://test.local/api/notifications/read-all",
        () => new HttpResponse(null, { status: 204 }),
      ),
    )

    await expect(markNotificationRead(client, notification.id)).rejects.toThrow(
      "PATCH /api/notifications/notification-1 returned no body",
    )
    await expect(dismissNotification(client, notification.id)).rejects.toThrow(
      "DELETE /api/notifications/notification-1 returned no body",
    )
    await expect(markAllNotificationsRead(client)).rejects.toThrow(
      "POST /api/notifications/read-all returned no body",
    )
  })
})
