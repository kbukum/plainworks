// @vitest-environment jsdom

import type { Notification } from "@plainworks/demo"
import { createMockServerHandle } from "@plainworks/demo/server"
import { createHttpClient } from "@plainworks/http"
import type { PaginatedResult } from "@plainworks/query"
import { createQueryClient } from "@plainworks/query"
import { deferred } from "@plainworks/testkit"
import { QueryClientProvider, useQuery } from "@tanstack/react-query"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { HttpResponse, http } from "msw"
import type { ReactElement, ReactNode } from "react"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { NOTIFICATION_LIST_PARAMS } from "../../app/constants"
import { notificationListPlan } from "../../app/notification-read"
import { HttpClientProvider } from "../http-client"
import { type NotificationMutationResult, useNotificationMutations } from "./notification-mutations"

// Focused coverage for the mutation concurrency and idempotency edges the section test can't force:
// an already-read no-op, a cache-less run, and a rollback that loses to a newer cache write.

const handle = createMockServerHandle({ seed: 11 })

beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
afterEach(() => {
  cleanup()
  handle.server.resetHandlers()
  handle.api.reset()
})
afterAll(() => handle.server.close())

type Page = PaginatedResult<Notification>

function harness(options: { rows?: Notification[]; observe?: boolean } = {}) {
  const httpClient = createHttpClient({ baseUrl: "http://showcase.test" })
  const queryClient = createQueryClient({ defaultOptions: { queries: { retry: false } } })
  const plan = notificationListPlan(httpClient, NOTIFICATION_LIST_PARAMS)
  const key = plan.queryKey
  if (options.rows !== undefined) {
    queryClient.setQueryData<Page>(key, seedPage(options.rows))
  }
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <QueryClientProvider client={queryClient}>
      <HttpClientProvider client={httpClient}>{children}</HttpClientProvider>
    </QueryClientProvider>
  )
  const hook = renderHook(
    () => {
      useQuery({ ...plan, enabled: options.observe === true })
      return useNotificationMutations(key)
    },
    { wrapper },
  )
  return { queryClient, key, ...hook }
}

function seedPage(rows: Notification[]): Page {
  return { data: rows, pagination: { page: 1, pageSize: 50, total: rows.length, totalPages: 1 } }
}

describe("notification mutations", () => {
  it("no-ops an already-read notification without a request", async () => {
    const { result } = harness()
    const read = { ...(handle.api.stores.notifications.getAll()[0] as Notification), read: true }

    // Any request would hit MSW's `onUnhandledRequest: "error"`; resolving proves none was made.
    await expect(result.current.markRead(read)).resolves.toBe("success")
  })

  it("runs a bulk mark without an optimistic write when the cache is empty", async () => {
    const { queryClient, key, result } = harness()
    handle.server.use(
      http.post("*/api/notifications/read-all", () => HttpResponse.json({ data: { updated: 0 } })),
    )
    await act(async () => {
      await result.current.markAllRead()
    })
    expect(queryClient.getQueryData(key)).toBeUndefined()
    expect(result.current.error).toBeUndefined()
  })

  it("keeps a newer cache write instead of clobbering it on a lost rollback", async () => {
    const { queryClient, key, result } = harness()
    const base = { ...(handle.api.stores.notifications.getAll()[0] as Notification), read: false }
    act(() => queryClient.setQueryData<Page>(key, seedPage([base])))

    const release = deferred<void>()
    handle.server.use(
      http.patch("*/api/notifications/:id", async () => {
        await release.promise
        return new HttpResponse(null, { status: 500 })
      }),
    )

    let settled: Promise<NotificationMutationResult> = Promise.resolve("success")
    act(() => {
      settled = result.current.markRead(base)
    })

    // A newer write lands while the request is in flight, bumping the cache version.
    act(() =>
      queryClient.setQueryData<Page>(key, (page) =>
        page === undefined
          ? page
          : { ...page, data: page.data.map((row) => ({ ...row, title: "Newer" })) },
      ),
    )

    release.resolve()
    await act(async () => {
      await settled
    })

    // The lost rollback re-syncs rather than reverting, so the newer title survives.
    const current = queryClient.getQueryData<Page>(key)
    expect(current?.data[0]?.title).toBe("Newer")
    await waitFor(() => expect(result.current.error).toBeDefined())
  })

  it("cancels an active stale read before applying and reconciles after the write", async () => {
    const base = { ...(handle.api.stores.notifications.getAll()[0] as Notification), read: false }
    let reads = 0
    let staleReadAborted = false
    handle.server.use(
      http.get("*/api/notifications", async ({ request }) => {
        reads += 1
        if (reads === 1) {
          await new Promise<void>((resolve) => {
            request.signal.addEventListener(
              "abort",
              () => {
                staleReadAborted = true
                resolve()
              },
              { once: true },
            )
          })
          return HttpResponse.json(seedPage([base]))
        }
        return HttpResponse.json(seedPage([{ ...base, read: true }]))
      }),
    )
    const { queryClient, key, result } = harness({ rows: [base], observe: true })
    await waitFor(() => expect(reads).toBe(1))

    await act(async () => {
      await result.current.markRead(base)
    })

    expect(staleReadAborted).toBe(true)
    await waitFor(() => expect(reads).toBe(2))
    expect(queryClient.getQueryData<Page>(key)?.data[0]?.read).toBe(true)
  })

  it("reconciles once after overlapping writes have all settled", async () => {
    const base = { ...(handle.api.stores.notifications.getAll()[0] as Notification), read: false }
    const patchRelease = deferred<void>()
    const deleteRelease = deferred<void>()
    handle.server.use(
      http.patch("*/api/notifications/:id", async () => {
        await patchRelease.promise
        return HttpResponse.json({ data: { ...base, read: true } })
      }),
      http.delete("*/api/notifications/:id", async () => {
        await deleteRelease.promise
        return HttpResponse.json({ data: { success: true } })
      }),
    )
    const { queryClient, result } = harness({ rows: [base] })
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")

    let markSettled: Promise<NotificationMutationResult> = Promise.resolve("failure")
    let dismissSettled: Promise<NotificationMutationResult> = Promise.resolve("failure")
    act(() => {
      markSettled = result.current.markRead(base)
      dismissSettled = result.current.dismiss(base)
    })

    patchRelease.resolve()
    await act(async () => {
      await markSettled
    })
    expect(invalidate).not.toHaveBeenCalled()

    deleteRelease.resolve()
    await act(async () => {
      await dismissSettled
    })
    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  it("rolls back without reporting failure when unmount cancels a write", async () => {
    const base = { ...(handle.api.stores.notifications.getAll()[0] as Notification), read: false }
    const started = deferred<void>()
    handle.server.use(
      http.patch("*/api/notifications/:id", async ({ request }) => {
        started.resolve()
        await new Promise<void>((resolve) => {
          request.signal.addEventListener("abort", () => resolve(), { once: true })
        })
        return HttpResponse.json({ data: { ...base, read: true } })
      }),
    )
    const { queryClient, key, result, unmount } = harness({ rows: [base] })
    let settled: Promise<NotificationMutationResult> = Promise.resolve("failure")
    act(() => {
      settled = result.current.markRead(base)
    })
    await started.promise

    unmount()

    await expect(settled).resolves.toBe("cancelled")
    expect(queryClient.getQueryData<Page>(key)?.data[0]?.read).toBe(false)
  })
})
