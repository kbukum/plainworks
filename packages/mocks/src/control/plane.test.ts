import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createLatency, MAX_LATENCY_MS } from "../latency"
import { bindMockServerLifecycle } from "../lifecycle"
import { createMockControl } from "./plane"

const clock = { now: () => 1_700_000_000_000 }
const onReset = vi.fn()
const latency = createLatency(0)
const graph = createMockControl(latency, onReset, clock)

// A dummy API endpoint so the logging/error-gate handler (scoped to `*/api/*`) has something to
// fall through to when error simulation is off.
const ping = http.get("*/api/ping", async ({ request }) => {
  await latency.wait(request.signal)
  return HttpResponse.json({ data: "pong" })
})
const server = setupServer(graph.loggingHandler, ping, ...graph.handlers)

const url = (path: string): string => `http://mock.test${path}`

bindMockServerLifecycle(server, { hooks: { beforeAll, afterEach, afterAll } })
afterEach(() => {
  vi.useRealTimers()
})
beforeEach(() => {
  onReset.mockClear()
  graph.control.clearRequestLog()
  graph.control.setError(false)
  latency.set(0)
})

describe("createMockControl programmatic surface", () => {
  it("toggles error simulation and snapshots state", () => {
    expect(graph.control.isErrorEnabled()).toBe(false)
    graph.control.setError(true)
    expect(graph.control.isErrorEnabled()).toBe(true)
    expect(graph.control.state()).toMatchObject({ globalError: true, globalDelay: 0 })
  })
})

describe("logging + error gate", () => {
  it("logs API requests and lets them pass through when healthy", async () => {
    expect((await fetch(url("/api/ping"))).status).toBe(200)
    expect(graph.control.requestLog()).toHaveLength(1)
    expect(graph.control.requestLog()[0]).toMatchObject({ method: "GET" })
  })

  it("fails every API request with 500 while error simulation is on", async () => {
    graph.control.setError(true)
    expect((await fetch(url("/api/ping"))).status).toBe(500)
  })

  it("never answers an application route that only ends in a control path", async () => {
    // No app handler matches, so the strict server rejects the request instead of the control
    // plane answering it.
    await expect(fetch(url("/api/users/mock/state"))).rejects.toThrow()
    await expect(fetch(url("/api/users/mock/reset"), { method: "POST" })).rejects.toThrow()
    expect(onReset).not.toHaveBeenCalled()
  })

  it("logs and gates an application route that only ends in a control path", async () => {
    graph.control.setError(true)
    expect((await fetch(url("/api/users/mock/state"))).status).toBe(500)
    expect(graph.control.requestLog()).toHaveLength(1)
  })
})

describe("/mock control endpoints", () => {
  it("reads and clears the request log", async () => {
    await fetch(url("/api/ping"))
    const listed = (await (await fetch(url("/mock/requests"))).json()) as { count: number }
    expect(listed.count).toBe(1)
    await fetch(url("/mock/requests"), { method: "DELETE" })
    const cleared = (await (await fetch(url("/mock/requests"))).json()) as { count: number }
    expect(cleared.count).toBe(0)
  })

  it("reads the request log without waiting for simulated API latency", async () => {
    vi.useFakeTimers()
    latency.set(1_000)
    let apiResolved = false
    const apiRequest = fetch(url("/api/ping")).then((response) => {
      apiResolved = true
      return response
    })

    const listed = await fetch(url("/mock/requests"))
    expect(listed.status).toBe(200)
    expect(apiResolved).toBe(false)

    await vi.advanceTimersByTimeAsync(1_000)
    expect((await apiRequest).status).toBe(200)
  })

  it("reports state", async () => {
    const state = (await (await fetch(url("/mock/state"))).json()) as {
      data: { globalError: boolean }
    }
    expect(state.data.globalError).toBe(false)
  })

  it("validates the error-toggle body", async () => {
    const ok = await fetch(url("/mock/error"), {
      method: "POST",
      body: JSON.stringify({ enabled: true }),
    })
    expect(ok.status).toBe(200)
    expect(graph.control.isErrorEnabled()).toBe(true)

    expect((await fetch(url("/mock/error"), { method: "POST", body: "not json" })).status).toBe(400)
    expect(
      (await fetch(url("/mock/error"), { method: "POST", body: JSON.stringify({ enabled: 1 }) }))
        .status,
    ).toBe(400)
  })

  it("keeps prefixed control routes available while error simulation is enabled", async () => {
    const enable = await fetch(url("/api/mock/error"), {
      method: "POST",
      body: JSON.stringify({ enabled: true }),
    })
    expect(enable.status).toBe(200)

    const disable = await fetch(url("/api/mock/error"), {
      method: "POST",
      body: JSON.stringify({ enabled: false }),
    })
    expect(disable.status).toBe(200)
    expect(graph.control.isErrorEnabled()).toBe(false)
  })

  it("validates the latency body and applies a valid value", async () => {
    const ok = await fetch(url("/mock/latency"), {
      method: "POST",
      body: JSON.stringify({ latency: 5 }),
    })
    expect(ok.status).toBe(200)
    expect(latency.get()).toBe(5)

    expect((await fetch(url("/mock/latency"), { method: "POST", body: "nope" })).status).toBe(400)
    expect(
      (
        await fetch(url("/mock/latency"), {
          method: "POST",
          body: JSON.stringify({ latency: -1 }),
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await fetch(url("/mock/latency"), {
          method: "POST",
          body: JSON.stringify({ latency: MAX_LATENCY_MS + 1 }),
        })
      ).status,
    ).toBe(400)
  })

  it("invokes the reset callback", async () => {
    expect((await fetch(url("/mock/reset"), { method: "POST" })).status).toBe(200)
    expect(onReset).toHaveBeenCalledOnce()
  })
})
