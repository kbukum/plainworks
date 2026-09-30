// @vitest-environment jsdom

import { createMockServerHandle } from "@plainworks/demo/server"
import { launchDevtools } from "@plainworks/devtools/launch"
import { createHttpClient } from "@plainworks/http"
import type { HttpInterceptor } from "@plainworks/http/interceptor"
import { bindMockServerLifecycle } from "@plainworks/mocks/lifecycle"
import { createQueryClient } from "@plainworks/query"
import { deferred } from "@plainworks/testkit"
import { createTestQueryClient } from "@plainworks/testkit/query"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { createShowcaseInspector } from "./inspector"

const handle = createMockServerHandle({ seed: 5 })
const origin = "http://showcase.test"

bindMockServerLifecycle(handle.server, { hooks: { beforeAll, afterEach, afterAll } })
afterEach(() => {
  handle.api.reset()
})

function launch(interceptors: readonly HttpInterceptor[] = []) {
  const report = vi.fn()
  const launcher = launchDevtools({ report, http: { instance: "api", label: "Demo API" } })
  const seam = launcher.http?.interceptor
  const httpClient = createHttpClient({
    baseUrl: origin,
    interceptors: seam === undefined ? interceptors : [...interceptors, seam],
  })
  const dispose = launcher.mount({
    load: async () => createShowcaseInspector({ httpClient, origin }),
    query: { client: createTestQueryClient(createQueryClient), instance: "app" },
  })
  return { dispose, httpClient, report }
}

describe("showcase devtools", () => {
  it("mounts the inspector beside the runtime and tears it down on cleanup", async () => {
    const { dispose, report } = launch()
    try {
      await vi.waitFor(() =>
        expect(document.querySelector("[data-plainworks-devtools]")).not.toBeNull(),
      )
    } finally {
      dispose()
    }
    expect(document.querySelector("[data-plainworks-devtools]")).toBeNull()
    expect(report).not.toHaveBeenCalled()
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
    const { dispose, httpClient } = launch([record])
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
    const { dispose } = launch()
    dispose()
    dispose()
    expect(document.querySelector("[data-plainworks-devtools]")).toBeNull()
  })
})
