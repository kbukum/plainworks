import type { IncomingMessage } from "node:http"
import { Readable } from "node:stream"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import { mockServerPlugin } from "./vite-plugin"

/**
 * A minimal generic handler set — the plugin serves any MSW handlers, so its middleware is proven
 * against a two-endpoint fixture rather than a full demo domain: a `GET` that lists and a `POST`
 * that echoes its body.
 */
function testHandlers() {
  return [
    http.get("*/api/tasks", () => HttpResponse.json({ data: [{ id: "t1", title: "seed" }] })),
    http.post("*/api/tasks", async ({ request }) => {
      const body = await request.json()
      return HttpResponse.json({ data: body }, { status: 201 })
    }),
  ]
}

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
      writableEnded: boolean
      setHeader: (key: string, value: string) => void
      end: (body?: string) => void
      on: (event: "close", listener: () => void) => void
      once: (event: "close", listener: () => void) => void
      off: (event: "close", listener: () => void) => void
    },
    next: () => void,
  ) => Promise<void>
}

/** Capture the middleware the plugin registers, without standing up a real Vite dev server. */
function captureMiddleware(
  options?: Parameters<typeof mockServerPlugin>[1],
  handlers: Parameters<typeof mockServerPlugin>[0] = testHandlers(),
): Captured {
  const plugin = mockServerPlugin(handlers, options)
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
  // A real readable stream, so the plugin's web-stream body read runs as it does on a socket.
  const req = Readable.from(body === undefined ? [] : [Buffer.from(body)]) as IncomingMessage
  req.method = method
  req.url = url
  req.headers = { host: "localhost:5173" }
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
    writableEnded: false,
    on: () => {},
    once: () => {},
    off: () => {},
    setHeader: (key: string, value: string) => {
      response.headers[key] = value
    },
    end: (chunk?: string) => {
      response.body = chunk ?? ""
      response.statusCode = res.statusCode
      res.writableEnded = true
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

  it("skips the response when the client disconnects during latency", async () => {
    const { middleware } = captureMiddleware({ latency: 60_000 })
    const listeners: (() => void)[] = []
    let ended = false
    const res = {
      statusCode: 200,
      writableEnded: false,
      on: (_event: "close", listener: () => void) => listeners.push(listener),
      once: (_event: "close", listener: () => void) => listeners.push(listener),
      off: () => {},
      setHeader: () => {},
      end: () => {
        ended = true
      },
    }
    const pending = middleware(fakeRequest("GET", "/api/tasks"), res, () => {})
    await Promise.resolve()
    for (const listener of listeners) listener()
    await pending
    expect(ended).toBe(false)
  })

  it("runs no handler when the client disconnects during latency", async () => {
    let handled = false
    const { middleware } = captureMiddleware({ latency: 60_000 }, [
      http.get("*/api/tasks", () => {
        handled = true
        return HttpResponse.json({ data: [] })
      }),
    ])
    const listeners: (() => void)[] = []
    const res = {
      statusCode: 200,
      writableEnded: false,
      on: (_event: "close", listener: () => void) => listeners.push(listener),
      once: (_event: "close", listener: () => void) => listeners.push(listener),
      off: () => {},
      setHeader: () => {},
      end: () => {},
    }
    const pending = middleware(fakeRequest("GET", "/api/tasks"), res, () => {})
    await Promise.resolve()
    for (const listener of listeners) listener()
    await pending
    expect(handled).toBe(false)
  })

  it("registers no middleware when disabled", () => {
    const plugin = mockServerPlugin(testHandlers(), { enabled: false })
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
    const handlers = testHandlers()
    expect(() => mockServerPlugin(handlers, { maxBodyBytes: Number.NaN })).toThrow(RangeError)
    expect(() => mockServerPlugin(handlers, { maxBodyBytes: 0 })).toThrow(RangeError)
    expect(() => mockServerPlugin(handlers, { latency: -1 })).toThrow(RangeError)
    expect(() => mockServerPlugin(handlers, { basePath: "api" })).toThrow(RangeError)
  })
})
