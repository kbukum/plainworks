import type { WebAbortSignal } from "@plainworks/std"
import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { createLatency, MAX_LATENCY_MS } from "../latency"
import { createMockControlClient, MockControlError, type MockControlTransport } from "./client"
import { MAX_REQUEST_LOG_SIZE } from "./limits"
import { MOCK_CONTROL_PATHS } from "./paths"
import { createMockControl } from "./plane"

const onReset = vi.fn()
const latency = createLatency(0)
const graph = createMockControl(latency, onReset, { now: () => 1_700_000_000_000 })
const ping = http.get("*/api/ping", () => HttpResponse.json({ data: "pong" }))
const server = setupServer(graph.loggingHandler, ping, ...graph.handlers)

const baseUrl = "http://mock.test"

// The smallest JSON transport over the MSW-backed `fetch`; hosts pass their `HttpClient` instead.
async function send(
  method: string,
  path: string,
  options?: { readonly body?: unknown; readonly signal?: WebAbortSignal },
): Promise<unknown> {
  options?.signal?.throwIfAborted()
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    ...(options?.body === undefined
      ? {}
      : { body: JSON.stringify(options.body), headers: { "content-type": "application/json" } }),
  })
  return response.json()
}

const transport: MockControlTransport = {
  get: (path, options) => send("GET", path, options),
  post: (path, options) => send("POST", path, options),
  delete: (path, options) => send("DELETE", path, options),
}
const control = createMockControlClient({ client: transport })

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => {
  server.resetHandlers()
  graph.control.clearRequestLog()
  graph.control.setError(false)
  latency.set(0)
  onReset.mockClear()
})
afterAll(() => server.close())

describe("createMockControlClient", () => {
  it("reads the control state and request log the server holds", async () => {
    await fetch(`${baseUrl}/api/ping`)

    expect(await control.state()).toEqual({ globalError: false, globalDelay: 0, requestCount: 1 })
    expect(await control.requestLog()).toEqual([
      expect.objectContaining({ method: "GET", url: `${baseUrl}/api/ping` }),
    ])
  })

  it("drives error simulation, latency, log clearing, and reset", async () => {
    await control.setError(true)
    expect(graph.control.isErrorEnabled()).toBe(true)

    await control.setLatency(120)
    expect(latency.get()).toBe(120)

    await fetch(`${baseUrl}/api/ping`)
    await control.clearRequestLog()
    expect(graph.control.requestLog()).toEqual([])

    await control.reset()
    expect(onReset).toHaveBeenCalledOnce()
  })

  it("rejects an out-of-range latency before sending anything", async () => {
    await expect(control.setLatency(MAX_LATENCY_MS + 1)).rejects.toBeInstanceOf(RangeError)
    await expect(control.setLatency(Number.NaN)).rejects.toBeInstanceOf(RangeError)
    expect(latency.get()).toBe(0)
  })

  it.each([
    ["state", { data: { globalError: "yes", globalDelay: 0, requestCount: 0 } }],
    ["state", { data: { globalError: false, globalDelay: 0, requestCount: -1 } }],
    ["requests", { data: [{ id: 1 }] }],
    [
      "requests",
      {
        data: Array.from({ length: MAX_REQUEST_LOG_SIZE + 1 }, (_, index) => ({
          id: String(index),
          url: "/api/tasks",
          method: "GET",
          timestamp: "2024-01-01T00:00:00.000Z",
        })),
      },
    ],
    ["reset", { success: false }],
  ] as const)("rejects a malformed %s response with a typed error", async (key, body) => {
    const path = MOCK_CONTROL_PATHS[key]
    server.use(http.all(`*${path}`, () => HttpResponse.json(body)))

    const call =
      key === "state"
        ? control.state()
        : key === "requests"
          ? control.requestLog()
          : control.reset()

    const error = await call.catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(MockControlError)
    expect(error).toMatchObject({ kind: "mocks/invalid-control-response", path })
  })

  it("cancels a call when its signal aborts", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(control.state(controller.signal)).rejects.toMatchObject({ name: "AbortError" })
  })
})
