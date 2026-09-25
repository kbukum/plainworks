import { createHttpClient, HttpError } from "@plainworks/http"
import type { WebRequestInit, WebResponse } from "@plainworks/std"
import { describe, expect, it } from "vitest"
import { createDevtoolsSession } from "../../session"
import type { SourceObserver } from "../../source"
import { createHttpSource, type HttpSourceOptions } from "./http-source"

type FetchStub = (input: string, init?: WebRequestInit) => Promise<WebResponse>

function setup(options: HttpSourceOptions, fetchStub: FetchStub) {
  const session = createDevtoolsSession()
  const { source, interceptor } = createHttpSource(options)
  session.registerSource(source)
  const port = session.connect()
  const client = createHttpClient({
    baseUrl: "https://api.test",
    fetch: fetchStub as never,
    interceptors: [interceptor],
  })
  return { session, port, client }
}

function eventsOf(port: ReturnType<ReturnType<typeof createDevtoolsSession>["connect"]>) {
  return port.snapshot().events.map((entry) => entry.event)
}

describe("createHttpSource", () => {
  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY])(
    "rejects an invalid detail capacity of %s",
    (detailCapacity) => {
      expect(() => createHttpSource({ instance: "api", detailCapacity })).toThrowError(RangeError)
    },
  )

  it("requires an explicit instance identity", () => {
    const session = createDevtoolsSession()
    session.registerSource(createHttpSource({ instance: "api" }).source)
    session.registerSource(createHttpSource({ instance: "admin" }).source)
    expect(
      session
        .connect()
        .snapshot()
        .sources.map((source) => source.id),
    ).toEqual([
      { kind: "http", instance: "api" },
      { kind: "http", instance: "admin" },
    ])
  })

  it("correlates a successful request start with its completion and preserves the response", async () => {
    let clock = 1_000
    const { port, client } = setup({ instance: "api", now: () => clock }, async () => {
      clock = 1_040
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json", "content-length": "11" },
      })
    })

    const response = await client.request({ path: "/tasks", query: { page: 1 } })
    expect(response.status).toBe(200)

    const events = eventsOf(port)
    const start = events.find((event) => event.kind === "http.request")
    const done = events.find((event) => event.kind === "http.response")
    expect(start?.summary).toMatchObject({ method: "GET", url: "https://api.test/tasks" })
    expect(done?.severity).toBe("ok")
    expect(done?.summary).toMatchObject({ status: 200, durationMs: 40, outcome: "ok", bytes: 11 })
    // The correlation id ties the start and settle events of one attempt together.
    expect((start?.summary as { id?: string } | undefined)?.id).toBe(
      (done?.summary as { id?: string } | undefined)?.id,
    )
  })

  it("never leaks the query string or credentials into the timeline", async () => {
    const { port, client } = setup(
      { instance: "api" },
      async () =>
        new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    )
    await client.request({ path: "/tasks", query: { page: 2, q: "x" } })
    const urls = eventsOf(port).map((event) => (event.summary as { url?: string }).url)
    for (const url of urls) {
      expect(url).toBe("https://api.test/tasks")
    }
  })

  it("reports a non-2xx status as a failing exchange and still throws HttpError.status", async () => {
    const { port, client } = setup(
      { instance: "api" },
      async () => new Response("nope", { status: 500 }),
    )
    await expect(client.request({ path: "/tasks" })).rejects.toBeInstanceOf(HttpError)

    const settle = eventsOf(port).find((event) => event.kind === "http.error")
    expect(settle?.severity).toBe("error")
    expect(settle?.summary).toMatchObject({ status: 500, outcome: "error" })
    const indicator = port.snapshot().indicators.find((entry) => entry.indicator.id === "http")
    expect(indicator?.indicator.severity).toBe("error")
    expect(indicator?.indicator.value).toContain("1 failed")
  })

  it("turns the indicator healthy after a success while keeping the failure total", async () => {
    let status = 500
    const { port, client } = setup({ instance: "api" }, async () => new Response("{}", { status }))
    await expect(client.request({ path: "/tasks" })).rejects.toBeInstanceOf(HttpError)
    status = 200
    await client.request({ path: "/tasks" })

    const indicator = port.snapshot().indicators.find((entry) => entry.indicator.id === "http")
    expect(indicator?.indicator.severity).toBe("ok")
    expect(indicator?.indicator.value).toBe("2 requests · 1 failed")
  })

  it("keeps a newer session observing when an earlier registration is disposed", async () => {
    const { source, interceptor } = createHttpSource({ instance: "api" })
    const first = createDevtoolsSession()
    const second = createDevtoolsSession()
    first.registerSource(source)
    second.registerSource(source)
    first.dispose()

    const client = createHttpClient({
      baseUrl: "https://api.test",
      fetch: (async () => new Response("{}", { status: 200 })) as never,
      interceptors: [interceptor],
    })
    await client.request({ path: "/tasks" })

    expect(eventsOf(second.connect()).map((event) => event.kind)).toContain("http.response")
  })

  it("reports a transport failure as an error and preserves the network error", async () => {
    const { port, client } = setup({ instance: "api" }, async () => {
      throw new TypeError("connection refused")
    })
    await expect(client.request({ path: "/tasks" })).rejects.toMatchObject({ kind: "http/network" })
    const settle = eventsOf(port).find((event) => event.kind === "http.error")
    expect(settle?.summary).toMatchObject({ outcome: "error" })
  })

  it("masks a non-Error thrown value in the timeline", async () => {
    const { port, client } = setup({ instance: "api" }, async () => {
      throw "secret-payload"
    })
    await client.request({ path: "/tasks" }).catch(() => {})
    const settle = eventsOf(port).find((event) => event.kind === "http.error")
    expect(JSON.stringify(settle)).not.toContain("secret-payload")
  })

  it("still executes a request when the diagnostics clock throws", async () => {
    let called = false
    const { client } = setup(
      {
        instance: "api",
        now: () => {
          throw new Error("clock down")
        },
      },
      async () => {
        called = true
        return new Response("{}", { status: 200 })
      },
    )

    await expect(client.request({ path: "/tasks" })).resolves.toMatchObject({ status: 200 })
    expect(called).toBe(true)
  })

  it("settles in-flight bookkeeping when the diagnostics clock fails after the request", async () => {
    let failClock = false
    let attempts = 0
    const { port, client } = setup(
      {
        instance: "api",
        now: () => {
          if (failClock) throw new Error("clock down")
          return 1
        },
      },
      async () => {
        attempts += 1
        if (attempts === 1) failClock = true
        return new Response("{}", { status: 200 })
      },
    )

    await expect(client.request({ path: "/first" })).resolves.toMatchObject({ status: 200 })
    failClock = false
    await expect(client.request({ path: "/second" })).resolves.toMatchObject({ status: 200 })
    const indicator = port.snapshot().indicators.find((entry) => entry.indicator.id === "http")
    expect(indicator?.indicator.value).not.toContain("in flight")
  })

  it("classifies a caller cancellation as canceled, not a failure", async () => {
    const controller = new AbortController()
    const { port, client } = setup({ instance: "api", now: () => 5 }, async (_input, init) => {
      return await new Promise<WebResponse>((_resolve, reject) => {
        const abortError = Object.assign(new Error("aborted"), { name: "AbortError" })
        init?.signal?.addEventListener("abort", () => reject(abortError))
        controller.abort()
      })
    })
    await expect(
      client.request({ path: "/tasks", signal: controller.signal as never }),
    ).rejects.toMatchObject({ name: "AbortError" })

    const settle = eventsOf(port).find((event) => event.kind === "http.canceled")
    expect(settle?.severity).toBe("warn")
    const indicator = port.snapshot().indicators.find((entry) => entry.indicator.id === "http")
    expect(indicator?.indicator.value).not.toContain("failed")
  })

  it("captures only allowlisted headers into on-demand detail; a secret header stays redacted", async () => {
    const { port, client } = setup(
      { instance: "api", captureHeaders: ["x-trace-id", "authorization"] },
      async () =>
        new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    )
    await client.request({
      path: "/tasks",
      headers: { "x-trace-id": "trace-123", authorization: "Bearer super-secret-token" },
    })

    const settle = eventsOf(port).find((event) => event.kind === "http.response")
    expect(settle?.detail).toBeDefined()
    const detail = await port.requestDetail({ kind: "http", instance: "api" }, settle?.detail ?? "")
    expect(detail.ok).toBe(true)
    if (detail.ok) {
      const record = detail.value.value as { request: { headers: Record<string, string> } }
      expect(record.request.headers["x-trace-id"]).toBe("trace-123")
      // The credential is masked at capture, so a live token is never held raw in the retained
      // detail map ahead of the session's read-time redaction.
      expect(record.request.headers.authorization).not.toContain("super-secret-token")
    }
  })

  it("classifies a per-attempt timeout as a timeout, not a cancellation", async () => {
    const session = createDevtoolsSession()
    const { source, interceptor } = createHttpSource({ instance: "api", now: () => 7 })
    session.registerSource(source)
    const port = session.connect()
    const client = createHttpClient({
      baseUrl: "https://api.test",
      // The stub hangs until the attempt signal aborts, so the per-attempt deadline is what ends
      // it.
      fetch: ((_input: string, init?: WebRequestInit) =>
        new Promise<WebResponse>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          )
        })) as never,
      interceptors: [interceptor],
      // A resolved fake delay fires the deadline immediately; the client aborts the attempt with a
      // std TimeoutError reason and remaps the throw to a retryable http/timeout for the caller.
      timeoutMs: 10,
      delay: () => Promise.resolve(),
    })

    await expect(client.request({ path: "/tasks" })).rejects.toMatchObject({ kind: "http/timeout" })

    const settle = eventsOf(port).find((event) => event.kind === "http.timeout")
    expect(settle?.severity).toBe("warn")
    expect(settle?.summary).toMatchObject({ outcome: "timeout" })
    const indicator = port.snapshot().indicators.find((entry) => entry.indicator.id === "http")
    expect(indicator?.indicator.value).not.toContain("failed")
  })

  it("settles a timed-out attempt once when fetch ignores abort and resolves later", async () => {
    let resolveFetch: ((response: WebResponse) => void) | undefined
    const session = createDevtoolsSession()
    const { source, interceptor } = createHttpSource({ instance: "api", now: () => 7 })
    session.registerSource(source)
    const port = session.connect()
    const client = createHttpClient({
      baseUrl: "https://api.test",
      fetch: (() =>
        new Promise<WebResponse>((resolve) => {
          resolveFetch = resolve
        })) as never,
      interceptors: [interceptor],
      timeoutMs: 10,
      delay: () => Promise.resolve(),
    })

    await expect(client.request({ path: "/tasks" })).rejects.toMatchObject({ kind: "http/timeout" })
    expect(eventsOf(port).filter((event) => event.kind === "http.timeout")).toHaveLength(1)
    expect(
      port.snapshot().indicators.find((entry) => entry.indicator.id === "http")?.indicator.value,
    ).not.toContain("in flight")

    resolveFetch?.(new Response("{}", { status: 200 }))
    await Promise.resolve()
    await Promise.resolve()
    expect(eventsOf(port).filter((event) => event.kind.startsWith("http."))).toHaveLength(2)
    expect(eventsOf(port).some((event) => event.kind === "http.response")).toBe(false)
  })

  it("exposes no detail token when nothing is allowlisted", async () => {
    const { port, client } = setup(
      { instance: "api" },
      async () =>
        new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    )
    await client.request({ path: "/tasks" })
    expect(eventsOf(port).every((event) => event.detail === undefined)).toBe(true)
  })

  it("stops observing after the source is disposed", async () => {
    const session = createDevtoolsSession()
    const { source, interceptor } = createHttpSource({ instance: "api" })
    const subscription = session.registerSource(source)
    const port = session.connect()
    const client = createHttpClient({
      baseUrl: "https://api.test",
      fetch: (async () =>
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        })) as never,
      interceptors: [interceptor],
    })
    subscription.unsubscribe()
    await client.request({ path: "/tasks" })
    expect(port.snapshot().events).toHaveLength(0)
  })

  it("isolates a faulting bridge: a devtools throw never replaces the request outcome", async () => {
    const throwing: SourceObserver = {
      emit: () => {
        throw new Error("bridge down")
      },
      indicate: () => {
        throw new Error("bridge down")
      },
      fail: () => {},
      recover: () => {},
    }

    const ok = createHttpSource({ instance: "ok" })
    ok.source.connect(throwing, undefined as never)
    const okClient = createHttpClient({
      baseUrl: "https://api.test",
      fetch: (async () => new Response("{}", { status: 200 })) as never,
      interceptors: [ok.interceptor],
    })
    // The successful response is returned even though every observation throws.
    await expect(okClient.request({ path: "/tasks" })).resolves.toMatchObject({ status: 200 })

    const bad = createHttpSource({ instance: "bad" })
    bad.source.connect(throwing, undefined as never)
    const badClient = createHttpClient({
      baseUrl: "https://api.test",
      fetch: (async () => {
        throw new Error("network")
      }) as never,
      interceptors: [bad.interceptor],
    })
    // The caller's normal error contract is preserved — not the bridge's "bridge down".
    const error = await badClient.request({ path: "/tasks" }).catch((cause: unknown) => cause)
    expect(String(error)).not.toContain("bridge down")
  })
})
