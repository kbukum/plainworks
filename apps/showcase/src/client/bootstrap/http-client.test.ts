import { sessionFailureReasons } from "@plainworks/auth/session"
import { expect, test, vi } from "vitest"
import { createBrowserHttpClient } from "./http-client"

test("a session-store outage on a protected write fails closed and is never retried", async () => {
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          title: "Unavailable",
          status: 503,
          reason: sessionFailureReasons.storeUnavailable,
        }),
        { status: 503, headers: { "content-type": "application/problem+json" } },
      ),
  )
  const invalidate = vi.fn()
  const client = createBrowserHttpClient({
    origin: "https://showcase.test",
    protectedSession: {
      acquire: async () => ({ signal: new AbortController().signal, headers: {}, release() {} }),
      revalidate: async () => {},
      invalidate,
    },
    fetch,
  })
  await expect(client.post("/api/tasks", { body: {} })).rejects.toMatchObject({
    status: 503,
    reason: sessionFailureReasons.storeUnavailable,
    authentication: "unavailable",
    retryable: false,
  })
  expect(fetch).toHaveBeenCalledOnce()
  expect(invalidate).toHaveBeenCalledWith(
    expect.objectContaining({ authentication: "unavailable" }),
  )
})
