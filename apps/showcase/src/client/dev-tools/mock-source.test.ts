// @vitest-environment jsdom

import { createMockServerHandle } from "@plainworks/demo/server"
import { createDevtoolsSession, sourceKey } from "@plainworks/devtools"
import { createHttpClient, type HttpClient } from "@plainworks/http"
import { createMockControlClient, type MockControlClient } from "@plainworks/mocks"
import { deferred } from "@plainworks/testkit"
import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { createMockSource, MOCK_SOURCE_ID, MOCK_STATE_REF } from "./mock-source"

const handle = createMockServerHandle({ seed: 21 })

beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
afterEach(() => {
  handle.server.resetHandlers()
  handle.api.reset()
})
afterAll(() => handle.server.close())

function controlOf(client: HttpClient): MockControlClient {
  return createMockControlClient({ client })
}

function makeClient(): HttpClient {
  return createHttpClient({ baseUrl: "http://showcase.test" })
}

function setup(client: HttpClient) {
  const session = createDevtoolsSession()
  const registration = session.registerSource(
    createMockSource({ control: controlOf(client), client, pollIntervalMs: 0, now: () => 1_000 }),
  )
  return { session, port: session.connect(), registration }
}

const KEY = sourceKey(MOCK_SOURCE_ID)

describe("createMockSource", () => {
  it("supersedes a pending poll after a command instead of publishing stale control state", async () => {
    const started = deferred<AbortSignal>()
    const release = deferred<void>()
    handle.server.use(
      http.get(
        "*/mock/state",
        async ({ request }) => {
          started.resolve(request.signal)
          await release.promise
          return HttpResponse.json({ data: { globalError: false, globalDelay: 0 } })
        },
        { once: true },
      ),
    )
    const { port, session } = setup(makeClient())
    try {
      const firstSignal = await started.promise
      const result = await port.runCommand(MOCK_SOURCE_ID, "toggle-error", { enabled: true })
      expect(result.ok).toBe(true)
      expect(firstSignal.aborted).toBe(true)
      expect(
        port.snapshot().indicators.find((entry) => entry.indicator.id === "errors")?.indicator
          .value,
      ).toBe("on")
    } finally {
      release.resolve()
      session.dispose()
    }
  })

  it("publishes error, latency, and request-count indicators from the control plane", async () => {
    const client = makeClient()
    const { port, session } = setup(client)
    try {
      await vi.waitFor(() => {
        const ids = port
          .snapshot()
          .indicators.filter((entry) => sourceKey(entry.id) === KEY)
          .map((entry) => entry.indicator.id)
        expect(ids).toEqual(expect.arrayContaining(["errors", "latency", "requests"]))
      })
    } finally {
      session.dispose()
    }
  })

  it("resolves the control state as structured data, not as the rail's formatted labels", async () => {
    const client = makeClient()
    await controlOf(client).setLatency(75)
    const { port, session } = setup(client)
    try {
      const detail = await vi.waitFor(async () => {
        const result = await port.requestDetail(MOCK_SOURCE_ID, MOCK_STATE_REF)
        expect(result.ok).toBe(true)
        return result
      })
      expect(detail.ok && detail.value.value).toEqual({ errorEnabled: false, latencyMs: 75 })
    } finally {
      session.dispose()
    }
  })

  it("emits a request event with on-demand detail for each recorded backend request", async () => {
    const client = makeClient()
    await client.get("/api/tasks")
    const { port, session } = setup(client)
    try {
      const entry = await vi.waitFor(() => {
        const events = port.snapshot().events.filter((event) => sourceKey(event.id) === KEY)
        const request = events.find((event) => event.event.kind === "mock.request")
        expect(request).toBeDefined()
        return request
      })
      expect(entry?.event.detail).toBeDefined()
      const detail = await port.requestDetail(MOCK_SOURCE_ID, entry?.event.detail ?? "")
      expect(detail.ok).toBe(true)
    } finally {
      session.dispose()
    }
  })

  it("toggles the mock error gate through the mutating command", async () => {
    const client = makeClient()
    const { port, session } = setup(client)
    try {
      const result = await port.runCommand(MOCK_SOURCE_ID, "toggle-error", { enabled: true })
      expect(result.ok).toBe(true)
      const state = await client.get("/mock/state")
      expect((state as { data: { globalError: boolean } }).data.globalError).toBe(true)
    } finally {
      session.dispose()
    }
  })

  it("sets latency and rejects an out-of-range value", async () => {
    const client = makeClient()
    const { port, session } = setup(client)
    try {
      const ok = await port.runCommand(MOCK_SOURCE_ID, "set-latency", { latencyMs: 40 })
      expect(ok.ok).toBe(true)
      const bad = await port.runCommand(MOCK_SOURCE_ID, "set-latency", { latencyMs: -5 })
      expect(bad.ok).toBe(false)
    } finally {
      session.dispose()
    }
  })

  it("runs an allowlisted read probe and refuses an unknown target", async () => {
    const client = makeClient()
    const { port, session } = setup(client)
    try {
      const allowed = await port.runCommand(MOCK_SOURCE_ID, "probe-read", { path: "/api/tasks" })
      expect(allowed.ok).toBe(true)
      const denied = await port.runCommand(MOCK_SOURCE_ID, "probe-read", { path: "/api/secret" })
      expect(denied.ok).toBe(false)
    } finally {
      session.dispose()
    }
  })

  it("reports a control-plane failure to the session", async () => {
    handle.server.use(http.get("*/mock/state", () => HttpResponse.error()))
    const { port, session } = setup(makeClient())
    try {
      await vi.waitFor(() => {
        const failures = port.snapshot().failures.filter((entry) => sourceKey(entry.id) === KEY)
        expect(failures).toHaveLength(1)
      })
    } finally {
      session.dispose()
    }
  })

  it("retains only recent request details and strips URL credentials from every surface", async () => {
    const requests = [
      { id: "old", method: "GET", url: "not a URL: private-value", timestamp: "old" },
      {
        id: "new",
        method: "GET",
        url: "https://user:private-value@example.test/api/tasks?token=private-value#private-value",
        timestamp: "new",
      },
    ]
    handle.server.use(http.get("*/mock/requests", () => HttpResponse.json({ data: requests })))
    const session = createDevtoolsSession()
    session.registerSource(
      createMockSource({
        control: controlOf(makeClient()),
        client: makeClient(),
        pollIntervalMs: 0,
        detailCapacity: 1,
      }),
    )
    const port = session.connect()
    try {
      await vi.waitFor(() => expect(port.snapshot().events).toHaveLength(1))
      expect(JSON.stringify(port.snapshot())).not.toContain("private-value")
      const detail = await port.requestDetail(MOCK_SOURCE_ID, "new")
      expect(detail.ok).toBe(true)
      expect(JSON.stringify(detail)).not.toContain("private-value")
      expect((await port.requestDetail(MOCK_SOURCE_ID, "old")).ok).toBe(false)
      await port.runCommand(MOCK_SOURCE_ID, "toggle-error", { enabled: false })
      await vi.waitFor(() => expect(port.snapshot().events).toHaveLength(1))
    } finally {
      session.dispose()
    }
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    "rejects invalid detail capacity %s",
    (detailCapacity) => {
      const client = makeClient()
      expect(() =>
        createMockSource({ control: controlOf(client), client, detailCapacity }),
      ).toThrow(RangeError)
    },
  )

  it("stops polling and releases the source on disposal", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] })
    let reads = 0
    const countRead = ({ request }: { request: Request }) => {
      if (new URL(request.url).pathname === "/mock/state") reads += 1
    }
    handle.server.events.on("request:start", countRead)
    const client = makeClient()
    const session = createDevtoolsSession()
    session.registerSource(
      createMockSource({
        control: controlOf(client),
        client,
        pollIntervalMs: 50,
        now: () => 1_000,
      }),
    )
    try {
      await vi.waitFor(() => expect(reads).toBe(1))
      vi.advanceTimersByTime(50)
      await vi.waitFor(() => expect(reads).toBe(2))

      session.dispose()
      await vi.advanceTimersByTimeAsync(500)
      expect(reads).toBe(2)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      handle.server.events.removeListener("request:start", countRead)
      vi.useRealTimers()
    }
  })
})
