import { EventEmitter } from "node:events"
import type { IncomingMessage } from "node:http"
import { describe, expect, it } from "vitest"
import { createMockApi } from "./api"
import { mockServerPlugin } from "./vite-plugin"

interface FakeResponse {
  statusCode: number
  headers: Record<string, string>
  body: string
}

interface Captured {
  middleware: (
    req: IncomingMessage,
    res: {
      statusCode: number
      setHeader: (key: string, value: string) => void
      end: (body?: string) => void
    },
    next: () => void,
  ) => Promise<void>
}

/** Capture the middleware the plugin registers, without standing up a real Vite dev server. */
function captureMiddleware(options?: Parameters<typeof mockServerPlugin>[1]): Captured {
  const plugin = mockServerPlugin(createMockApi().handlers, options)
  let captured: Captured["middleware"] | undefined
  const fakeServer = {
    middlewares: {
      use: (fn: Captured["middleware"]) => {
        captured = fn
      },
    },
  }
  if (typeof plugin.configureServer === "function") {
    plugin.configureServer.call({} as never, fakeServer as never)
  }
  if (!captured) throw new Error("plugin did not register middleware")
  return { middleware: captured }
}

function fakeRequest(method: string, url: string, body?: string): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage
  req.method = method
  req.url = url
  req.headers = { host: "localhost:5173" }
  req.destroy = (() => req) as IncomingMessage["destroy"]
  // Deliver any body as data chunks on the next tick.
  queueMicrotask(() => {
    if (body !== undefined) req.emit("data", Buffer.from(body))
    req.emit("end")
  })
  return req
}

async function run(
  middleware: Captured["middleware"],
  method: string,
  url: string,
  body?: string,
): Promise<{ response: FakeResponse; calledNext: boolean }> {
  const response: FakeResponse = { statusCode: 200, headers: {}, body: "" }
  let calledNext = false
  const res = {
    statusCode: 200,
    setHeader: (key: string, value: string) => {
      response.headers[key] = value
    },
    end: (chunk?: string) => {
      response.body = chunk ?? ""
      response.statusCode = res.statusCode
    },
  }
  await middleware(fakeRequest(method, url, body), res, () => {
    calledNext = true
  })
  return { response, calledNext }
}

describe("mockServerPlugin middleware", () => {
  it("serves matching API requests", async () => {
    const { middleware } = captureMiddleware()
    const { response, calledNext } = await run(middleware, "GET", "/api/tasks?limit=2")
    expect(calledNext).toBe(false)
    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body) as { data: unknown[] }
    expect(body.data.length).toBeGreaterThan(0)
  })

  it("forwards request bodies to handlers", async () => {
    const { middleware } = captureMiddleware()
    const { response } = await run(
      middleware,
      "POST",
      "/api/tasks",
      JSON.stringify({ title: "from vite" }),
    )
    expect(response.statusCode).toBe(201)
    const body = JSON.parse(response.body) as { data: { title: string } }
    expect(body.data.title).toBe("from vite")
  })

  it("delegates requests outside the base path", async () => {
    const { middleware } = captureMiddleware()
    const { calledNext } = await run(middleware, "GET", "/other/route")
    expect(calledNext).toBe(true)
  })

  it("answers unmatched API requests with a terminal 404 instead of delegating", async () => {
    const { middleware } = captureMiddleware()
    const { response, calledNext } = await run(
      middleware,
      "POST",
      "/api/unknown",
      JSON.stringify({ a: 1 }),
    )
    expect(calledNext).toBe(false)
    expect(response.statusCode).toBe(404)
  })

  it("rejects oversized bodies with 413", async () => {
    const { middleware } = captureMiddleware({ maxBodyBytes: 16 })
    const { response, calledNext } = await run(
      middleware,
      "POST",
      "/api/tasks",
      JSON.stringify({ title: "this body is definitely longer than sixteen bytes" }),
    )
    expect(calledNext).toBe(false)
    expect(response.statusCode).toBe(413)
  })

  it("registers no middleware when disabled", () => {
    const plugin = mockServerPlugin(createMockApi().handlers, { enabled: false })
    let used = false
    const fakeServer = { middlewares: { use: () => (used = true) } }
    if (typeof plugin.configureServer === "function") {
      plugin.configureServer.call({} as never, fakeServer as never)
    }
    expect(used).toBe(false)
  })

  it("normalizes trailing-slash and root base paths", async () => {
    const slash = captureMiddleware({ basePath: "/api/" })
    const hit = await run(slash.middleware, "GET", "/api/tasks?limit=1")
    expect(hit.response.statusCode).toBe(200)

    const root = captureMiddleware({ basePath: "/" })
    const rootHit = await run(root.middleware, "GET", "/api/tasks?limit=1")
    expect(rootHit.response.statusCode).toBe(200)
  })

  it("leaves sibling routes like /apiary alone", async () => {
    const { middleware } = captureMiddleware()
    const { calledNext } = await run(middleware, "GET", "/apiary/bees")
    expect(calledNext).toBe(true)
  })

  it("rejects invalid options at creation time", () => {
    const handlers = createMockApi().handlers
    expect(() => mockServerPlugin(handlers, { maxBodyBytes: Number.NaN })).toThrow(RangeError)
    expect(() => mockServerPlugin(handlers, { maxBodyBytes: 0 })).toThrow(RangeError)
    expect(() => mockServerPlugin(handlers, { latency: -1 })).toThrow(RangeError)
    expect(() => mockServerPlugin(handlers, { basePath: "api" })).toThrow(RangeError)
  })
})
