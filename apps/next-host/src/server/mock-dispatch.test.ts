import { createHttpClient, type FetchLike } from "@plainworks/http"
import type { WebResponse } from "@plainworks/std"
import { describe, expect, it } from "vitest"
import { TASK_LIST_PARAMS } from "../neutral/constants"
import { readTaskPage } from "../neutral/task-read"
import { createDemoBackend } from "./mock-dispatch"

// The host serves its task domain from a Next route handler that dispatches an incoming `Request`
// through the published `@plainworks/mocks` handlers — the same seeded fixtures the browser and the
// RSC prefetch read over real HTTP. This proves the in-process dispatch resolves matched and
// unmatched routes, seeds isolated stores per backend, preserves POST fields, respects domain
// sorting, and that the neutral server read runs unchanged over the same backend (reached here by
// routing the client's `fetch` through dispatch).

const ORIGIN = "http://next-host.test"

describe("createDemoBackend dispatch", () => {
  it("dispatches a matched request to the seeded mock handlers", async () => {
    const backend = createDemoBackend({ seed: 7 })
    const response = await backend.dispatch(new Request(`${ORIGIN}/api/tasks`))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: unknown[] }
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBeGreaterThan(0)
  })

  it("resolves an unmatched path to a JSON 404 rather than passing through", async () => {
    const backend = createDemoBackend({ seed: 7 })
    const response = await backend.dispatch(new Request(`${ORIGIN}/api/nope`))
    expect(response.status).toBe(404)
  })

  it("preserves the assigneeId and dueDate a POST supplies", async () => {
    const backend = createDemoBackend({ seed: 7 })
    const response = await backend.dispatch(
      new Request(`${ORIGIN}/api/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Ship it", assigneeId: "user-42", dueDate: "2030-01-01" }),
      }),
    )
    expect(response.status).toBe(201)
    const created = (await response.json()) as { data: { assigneeId?: string; dueDate?: string } }
    expect(created.data.assigneeId).toBe("user-42")
    expect(created.data.dueDate).toBe("2030-01-01")
  })

  it("rejects a task create request without a title with 400", async () => {
    const backend = createDemoBackend({ seed: 7 })
    const response = await backend.dispatch(
      new Request(`${ORIGIN}/api/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: "Missing title", priority: "high" }),
      }),
    )
    expect(response.status).toBe(400)
  })

  it("sorts descending priority as high -> medium -> low", async () => {
    const backend = createDemoBackend({ seed: 7 })
    const response = await backend.dispatch(
      new Request(`${ORIGIN}/api/tasks?sortBy=priority&order=desc&pageSize=40`),
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: Array<{ priority: string }> }
    const priorities = body.data.map((t) => t.priority)
    const rank: Record<string, number> = { high: 3, medium: 2, low: 1 }
    for (let i = 1; i < priorities.length; i++) {
      const prev = priorities[i - 1] ?? ""
      const curr = priorities[i] ?? ""
      expect(rank[prev] ?? 0).toBeGreaterThanOrEqual(rank[curr] ?? 0)
    }
  })

  it("seeds isolated stores per backend — no shared module state", async () => {
    const first = await createDemoBackend({ seed: 1 }).dispatch(new Request(`${ORIGIN}/api/tasks`))
    const second = await createDemoBackend({ seed: 2 }).dispatch(new Request(`${ORIGIN}/api/tasks`))
    expect(await first.json()).not.toEqual(await second.json())
  })
})

describe("neutral server read over the mock backend", () => {
  it("reads the validated task page the RSC prefetch consumes", async () => {
    const backend = createDemoBackend({ seed: 7 })
    // The HTTP client's `fetch` seam speaks the universal shim `WebResponse`; the mock backend's
    // `dispatch` returns the host's structurally identical global `Response`, so cross the nominal
    // seam here the way the app crosses MSW's branded I/O.
    const routeThroughBackend: FetchLike = (input) =>
      backend.dispatch(new Request(input)) as unknown as Promise<WebResponse>
    const client = createHttpClient({ baseUrl: ORIGIN, fetch: routeThroughBackend })
    const page = await readTaskPage(client, TASK_LIST_PARAMS)
    expect(page.data.length).toBeGreaterThan(0)
    expect(page.pagination.page).toBe(1)
  })
})
