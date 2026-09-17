import { createMockServerHandle } from "@plainworks/demo/server"
import { createHttpClient } from "@plainworks/http"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { TASK_LIST_PARAMS } from "../neutral/constants"
import { readTaskPage } from "../neutral/task-read"
import { createDemoBackend } from "./mock-dispatch"

// The host serves the demo domain from a Next route handler that dispatches an incoming `Request`
// through the published `@plainworks/mocks` handlers — the same seeded fixtures the browser and the
// RSC prefetch read over real HTTP. This proves the in-process dispatch resolves matched and
// unmatched routes, and that the neutral server read runs unchanged over the same demo backend
// (exercised here through MSW, the way the RSC prefetch reaches it).

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

  it("seeds isolated stores per backend — no shared module state", () => {
    const a = createDemoBackend({ seed: 1 })
    const b = createDemoBackend({ seed: 2 })
    expect(a.api.stores.tasks.getAll()).not.toEqual(b.api.stores.tasks.getAll())
  })
})

describe("neutral server read over the demo backend", () => {
  const handle = createMockServerHandle({ seed: 7 })

  beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
  afterEach(() => {
    handle.server.resetHandlers()
    handle.api.reset()
  })
  afterAll(() => handle.server.close())

  it("reads the validated task page the RSC prefetch consumes", async () => {
    const client = createHttpClient({ baseUrl: ORIGIN })
    const page = await readTaskPage(client, TASK_LIST_PARAMS)
    expect(page.data.length).toBeGreaterThan(0)
    expect(page.pagination.page).toBe(1)
  })
})
