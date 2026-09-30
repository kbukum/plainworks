import { http } from "msw"
import { type SetupServer, setupServer } from "msw/node"
import { describe, expect, it, vi } from "vitest"
import { bindMockServerLifecycle, installMockServer, type MockServerHooks } from "./msw-server"

// Hooks that run each callback immediately, so one call drives the whole listen/reset/close cycle.
function immediateHooks(): MockServerHooks {
  return {
    beforeAll: vi.fn((setup: () => void) => setup()),
    afterEach: vi.fn((reset: () => void) => reset()),
    afterAll: vi.fn((close: () => void) => close()),
  }
}

function spyLifecycle(server: SetupServer) {
  return {
    listen: vi.spyOn(server, "listen").mockImplementation(() => {}),
    resetHandlers: vi.spyOn(server, "resetHandlers").mockImplementation(() => {}),
    close: vi.spyOn(server, "close").mockImplementation(() => {}),
  }
}

describe("bindMockServerLifecycle", () => {
  it("listens strictly, resets after each test, and closes after all", () => {
    const server = setupServer()
    const spies = spyLifecycle(server)

    bindMockServerLifecycle(server, { hooks: immediateHooks() })

    expect(spies.listen).toHaveBeenCalledWith({ onUnhandledRequest: "error" })
    expect(spies.resetHandlers).toHaveBeenCalledOnce()
    expect(spies.close).toHaveBeenCalledOnce()
  })

  it("forwards a caller-chosen unhandled-request policy", () => {
    const server = setupServer()
    const spies = spyLifecycle(server)

    bindMockServerLifecycle(server, { hooks: immediateHooks(), onUnhandledRequest: "bypass" })

    expect(spies.listen).toHaveBeenCalledWith({ onUnhandledRequest: "bypass" })
  })
})

describe("installMockServer", () => {
  it("registers each lifecycle step with the injected hooks without starting the server", () => {
    const hooks: MockServerHooks = {
      beforeAll: vi.fn(),
      afterEach: vi.fn(),
      afterAll: vi.fn(),
    }

    installMockServer({
      handlers: [http.get("https://plainworks.test/tasks", () => new Response())],
      hooks,
    })

    expect(hooks.beforeAll).toHaveBeenCalledOnce()
    expect(hooks.afterEach).toHaveBeenCalledOnce()
    expect(hooks.afterAll).toHaveBeenCalledOnce()
  })

  it("serves its handlers once the runner starts it", async () => {
    let start: () => void = () => {}
    let stop: () => void = () => {}
    const server = installMockServer({
      handlers: [http.get("https://plainworks.test/tasks", () => Response.json(["one"]))],
      hooks: {
        beforeAll: (setup) => {
          start = setup
        },
        afterEach: () => {},
        afterAll: (close) => {
          stop = close
        },
      },
    })

    start()
    try {
      const response = await fetch("https://plainworks.test/tasks")
      expect(await response.json()).toEqual(["one"])
      await expect(fetch("https://plainworks.test/unknown")).rejects.toThrow()
    } finally {
      stop()
    }
    expect(server.listHandlers()).toHaveLength(1)
  })
})
