// @vitest-environment jsdom

import { createMockServerHandle } from "@plainworks/demo/server"
import { createHttpClient, type HttpInterceptor } from "@plainworks/http"
import { createQueryClient } from "@plainworks/query"
import { deferred } from "@plainworks/testkit"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { mountShowcaseDevtools } from "./mount"
import { createShowcaseDevtoolsSeams } from "./seams"

const handle = createMockServerHandle({ seed: 5 })
const origin = "http://showcase.test"

beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
afterEach(() => {
  handle.server.resetHandlers()
  handle.api.reset()
})
afterAll(() => handle.server.close())

function mount() {
  const seams = createShowcaseDevtoolsSeams()
  const httpClient = createHttpClient({ baseUrl: origin, interceptors: [seams.http.interceptor] })
  const dispose = mountShowcaseDevtools({
    seams,
    httpClient,
    queryClient: createQueryClient(),
    origin,
  })
  return { dispose }
}

describe("showcase devtools", () => {
  it("builds the HTTP seam without touching the DOM", () => {
    const seams = createShowcaseDevtoolsSeams()
    expect(typeof seams.http.interceptor).toBe("function")
    expect(document.querySelector("[data-plainworks-devtools]")).toBeNull()
  })

  it("mounts the inspector beside the runtime and tears it down on cleanup", async () => {
    const { dispose } = mount()
    try {
      await vi.waitFor(() =>
        expect(document.querySelector("[data-plainworks-devtools]")).not.toBeNull(),
      )
    } finally {
      dispose()
    }
    expect(document.querySelector("[data-plainworks-devtools]")).toBeNull()
  })

  it("keeps the mock control plane out of the observed HTTP client", async () => {
    const observed: string[] = []
    const record: HttpInterceptor = (next) => (request) => {
      observed.push(new URL(request.url).pathname)
      return next(request)
    }
    const polled = deferred<void>()
    const onRequest = ({ request }: { request: Request }): void => {
      if (new URL(request.url).pathname === "/mock/state") polled.resolve()
    }
    handle.server.events.on("request:start", onRequest)
    const seams = createShowcaseDevtoolsSeams()
    const httpClient = createHttpClient({
      baseUrl: origin,
      interceptors: [record, seams.http.interceptor],
    })
    const dispose = mountShowcaseDevtools({
      seams,
      httpClient,
      queryClient: createQueryClient(),
      origin,
    })
    try {
      await polled.promise
      await httpClient.get("/api/tasks")
      expect(observed).toEqual(["/api/tasks"])
    } finally {
      dispose()
      handle.server.events.removeListener("request:start", onRequest)
    }
  })

  it("tolerates a repeated teardown from the host's own lifecycle", () => {
    const { dispose } = mount()
    dispose()
    dispose()
    expect(document.querySelector("[data-plainworks-devtools]")).toBeNull()
  })
})
