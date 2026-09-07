import {
  type Delay,
  RetryError,
  type RetryPolicy,
  TimeoutError,
  unsafePassthrough,
  type WebResponse,
} from "@plainworks/std"
import { fakeAuthHeaderProvider, fakeFetch, fakeSchema, guardSchema } from "@plainworks/testkit"
import { expect, test, vi } from "vitest"
import { HttpError } from "../error"
import type { HttpInterceptor } from "../interceptor"
import { createHttpClient } from "./client"

/**
 * A deterministic {@link Delay}: a small backoff wait resolves instantly (so retries proceed without
 * real time), while a large per-attempt timeout wait stays pending until its signal aborts (so it
 * only fires when the request explicitly sets a tiny timeout). Splitting on the ms budget lets one
 * injected delay serve both the timeout and the backoff paths.
 */
function testDelay(thresholdMs = 10_000): { delay: Delay; waits: number[] } {
  const waits: number[] = []
  const delay: Delay = (ms, signal) => {
    if (ms >= thresholdMs) {
      return new Promise<void>((_, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("cleared")), { once: true })
      })
    }
    waits.push(ms)
    return Promise.resolve()
  }
  return { delay, waits }
}

function jsonResponse(data: unknown, status = 200, headers?: Record<string, string>): WebResponse {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })
}

interface Widget {
  readonly id: number
}

function isWidget(value: unknown): value is Widget {
  return typeof value === "object" && value !== null && typeof (value as Widget).id === "number"
}

const retry: RetryPolicy = {
  maxAttempts: 3,
  backoff: { baseMs: 10, maxMs: 100, factor: 2, jitter: "none" },
  idempotent: true,
}

test("resolves the decoded body and defaults to GET against the base URL", async () => {
  const { fetch, calls } = fakeFetch([jsonResponse({ id: 1 })])
  const client = createHttpClient({
    baseUrl: "https://api.test/v1",
    fetch,
    delay: testDelay().delay,
  })

  const response = await client.request({ path: "widgets/1" })

  expect(response.data).toEqual({ id: 1 })
  expect(response.status).toBe(200)
  expect(calls[0]?.url).toBe("https://api.test/v1/widgets/1")
  expect(calls[0]?.init?.method).toBe("GET")
})

test("encodes a JSON body and sets the content type, letting a caller header win", async () => {
  const { fetch, calls } = fakeFetch([jsonResponse({ ok: true }), jsonResponse({ ok: true })])
  const client = createHttpClient({
    baseUrl: "https://api.test",
    fetch,
    headers: { "x-app": "plainworks" },
    delay: testDelay().delay,
  })

  await client.request({ method: "POST", path: "widgets", body: { name: "a" } })
  await client.request({
    method: "POST",
    path: "widgets",
    body: { name: "a" },
    headers: { "content-type": "application/vnd.custom" },
  })

  const first = new Headers(calls[0]?.init?.headers)
  expect(calls[0]?.init?.body).toBe('{"name":"a"}')
  expect(first.get("content-type")).toBe("application/json")
  expect(first.get("x-app")).toBe("plainworks")
  expect(new Headers(calls[1]?.init?.headers).get("content-type")).toBe("application/vnd.custom")
})

test("injects the auth header from the provider on every attempt", async () => {
  const { fetch, calls } = fakeFetch([jsonResponse({}, 503), jsonResponse({ ok: true })])
  const auth = fakeAuthHeaderProvider({ headers: { authorization: "Bearer t" } })
  const client = createHttpClient({
    baseUrl: "https://api.test",
    fetch,
    authProvider: auth.provider,
    retry,
    delay: testDelay().delay,
  })

  await client.request({ path: "me" })

  expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe("Bearer t")
  expect(new Headers(calls[1]?.init?.headers).get("authorization")).toBe("Bearer t")
  expect(auth.calls).toBe(2)
})

test("maps a per-attempt timeout to a typed http/timeout error preserving the cause", async () => {
  const { fetch } = fakeFetch(["hang"])
  const client = createHttpClient({ baseUrl: "https://api.test", fetch, delay: testDelay().delay })

  const error = await client.request({ path: "slow", timeoutMs: 50 }).catch((e: unknown) => e)
  expect(error).toBeInstanceOf(HttpError)
  expect(error).toMatchObject({ kind: "http/timeout", category: "timeout", retryable: true })
  expect((error as HttpError).cause).toBeInstanceOf(TimeoutError)
})

test("retries an idempotent request whose attempts time out, then surfaces http/timeout", async () => {
  const { fetch, calls } = fakeFetch(["hang"])
  const client = createHttpClient({
    baseUrl: "https://api.test",
    fetch,
    retry,
    delay: testDelay().delay,
  })

  const error = await client.request({ path: "slow", timeoutMs: 50 }).catch((e: unknown) => e)
  expect(error).toMatchObject({ kind: "http/timeout" })
  expect(error).not.toBeInstanceOf(RetryError)
  expect(calls.length).toBe(3)
})

test("retries an idempotent request on a 503 then succeeds", async () => {
  const { fetch, calls } = fakeFetch([jsonResponse({}, 503), jsonResponse({ ok: true })])
  const client = createHttpClient({
    baseUrl: "https://api.test",
    fetch,
    retry,
    delay: testDelay().delay,
  })

  const response = await client.request({ path: "widgets" })

  expect(response.data).toEqual({ ok: true })
  expect(calls.length).toBe(2)
})

test("does not retry a fatal 401 and surfaces a typed status error", async () => {
  const { fetch, calls } = fakeFetch([jsonResponse({}, 401)])
  const client = createHttpClient({
    baseUrl: "https://api.test",
    fetch,
    retry,
    delay: testDelay().delay,
  })

  await expect(client.request({ path: "me" })).rejects.toMatchObject({
    kind: "http/status",
    status: 401,
  })
  expect(calls.length).toBe(1)
})

test("surfaces a typed HttpError, not a RetryError, when retries are exhausted", async () => {
  const { fetch, calls } = fakeFetch([jsonResponse({}, 503)])
  const client = createHttpClient({
    baseUrl: "https://api.test",
    fetch,
    retry,
    delay: testDelay().delay,
  })

  const error = await client.request({ path: "widgets" }).catch((e: unknown) => e)
  expect(error).toBeInstanceOf(HttpError)
  expect(error).not.toBeInstanceOf(RetryError)
  expect(error).toMatchObject({ kind: "http/status", status: 503 })
  expect(calls.length).toBe(3)
})

test("clones headers per attempt so an interceptor mutation does not leak into a retry", async () => {
  const { fetch, calls } = fakeFetch([jsonResponse({}, 503), jsonResponse({ ok: true })])
  const mutating: HttpInterceptor = (next) => (request) => {
    request.headers.append("x-try", "1")
    return next(request)
  }
  const client = createHttpClient({
    baseUrl: "https://api.test",
    fetch,
    retry,
    interceptors: [mutating],
    delay: testDelay().delay,
  })

  await client.request({ path: "widgets" })

  expect(calls.length).toBe(2)
  expect(new Headers(calls[0]?.init?.headers).get("x-try")).toBe("1")
  // A shared base would accumulate "1, 1" on the second attempt; the clone keeps each attempt clean.
  expect(new Headers(calls[1]?.init?.headers).get("x-try")).toBe("1")
})

test("honors a Retry-After hint on a 429 before the next attempt", async () => {
  const { fetch, calls } = fakeFetch([
    jsonResponse({}, 429, { "retry-after": "1" }),
    jsonResponse({ ok: true }),
  ])
  const { delay, waits } = testDelay()
  // A backoff ceiling above the hint so the 1s server hint passes through unclamped.
  const hintRetry: RetryPolicy = {
    maxAttempts: 3,
    backoff: { baseMs: 10, maxMs: 5000, factor: 2, jitter: "none" },
    idempotent: true,
  }
  const client = createHttpClient({ baseUrl: "https://api.test", fetch, retry: hintRetry, delay })

  await client.request({ path: "widgets" })

  expect(calls.length).toBe(2)
  expect(waits).toContain(1000)
})

test("refuses a credential-shaped query parameter before any fetch", async () => {
  const { fetch, calls } = fakeFetch([jsonResponse({})])
  const client = createHttpClient({ baseUrl: "https://api.test", fetch, delay: testDelay().delay })

  await expect(client.request({ path: "x", query: { access_token: "s" } })).rejects.toMatchObject({
    kind: "http/unsafe-url",
  })
  expect(calls.length).toBe(0)
})

test("re-rejects a final URL an interceptor rewrote to embed a credential", async () => {
  const { fetch, calls } = fakeFetch([jsonResponse({})])
  const smuggle: HttpInterceptor = (next) => (request) =>
    next({ ...request, url: `${request.url}?access_token=live-secret` })
  const client = createHttpClient({
    baseUrl: "https://api.test",
    fetch,
    interceptors: [smuggle],
    delay: testDelay().delay,
  })

  await expect(client.request({ path: "x" })).rejects.toMatchObject({ kind: "http/unsafe-url" })
  // The guard runs at the transport, so the rewritten URL never reaches fetch.
  expect(calls.length).toBe(0)
})

test("refuses a cross-origin interceptor rewrite that would leak the injected credential", async () => {
  const { fetch, calls } = fakeFetch([jsonResponse({})])
  // A caller interceptor redirects to a different origin; the innermost auth interceptor then injects
  // the credential — which would ship to evil.test without the guard.
  const redirect: HttpInterceptor = (next) => (request) =>
    next({ ...request, url: "https://evil.test/steal" })
  const auth = fakeAuthHeaderProvider({ headers: { authorization: "******" } })
  const client = createHttpClient({
    baseUrl: "https://api.test",
    fetch,
    interceptors: [redirect],
    authProvider: auth.provider,
    delay: testDelay().delay,
  })

  await expect(client.request({ path: "me" })).rejects.toMatchObject({ kind: "http/unsafe-url" })
  // The credential never reaches the wire — the cross-origin rewrite is refused before fetch.
  expect(calls.length).toBe(0)
})

test("allows a same-origin interceptor rewrite carrying a credential", async () => {
  const { fetch, calls } = fakeFetch([jsonResponse({ ok: true })])
  const rewrite: HttpInterceptor = (next) => (request) =>
    next({ ...request, url: "https://api.test/rerouted" })
  const auth = fakeAuthHeaderProvider({ headers: { authorization: "******" } })
  const client = createHttpClient({
    baseUrl: "https://api.test",
    fetch,
    interceptors: [rewrite],
    authProvider: auth.provider,
    delay: testDelay().delay,
  })

  const response = await client.request({ path: "me" })

  // Same origin: the rewrite is honored and the credential is sent to the intended host.
  expect(calls[0]?.url).toBe("https://api.test/rerouted")
  expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe("******")
  // The response falls back to the final outbound URL when the transport reports none.
  expect(response.url).toBe("https://api.test/rerouted")
})

test("falls back to the final interceptor-rewritten URL when the transport reports no URL", async () => {
  const { fetch } = fakeFetch([jsonResponse({ ok: true })])
  const rewrite: HttpInterceptor = (next) => (request) =>
    next({ ...request, url: "https://api.test/v1/final" })
  const client = createHttpClient({
    baseUrl: "https://api.test/v1",
    fetch,
    interceptors: [rewrite],
    delay: testDelay().delay,
  })

  const response = await client.request({ path: "start" })

  // A JSON `Response` has an empty `url`; the fallback must be the final outbound URL, not the
  // pre-interceptor build (`.../v1/start`).
  expect(response.url).toBe("https://api.test/v1/final")
})

test("cancels a non-2xx response body, and a rejecting cancel does not mask the status error", async () => {
  let cancelled = 0
  // A response whose body cancel() rejects: the client must still surface the status error, never the
  // cancellation failure, and must attempt the teardown exactly once.
  const failingBody = {
    cancel: () => {
      cancelled += 1
      return Promise.reject(new Error("cancel failed"))
    },
  } as unknown as WebResponse["body"]
  const failing = {
    ok: false,
    status: 503,
    headers: new Headers(),
    url: "",
    body: failingBody,
  } as unknown as WebResponse
  const { fetch } = fakeFetch([failing])
  const client = createHttpClient({ baseUrl: "https://api.test", fetch, delay: testDelay().delay })

  const error = await client.request({ path: "x" }).catch((e: unknown) => e)

  expect(error).toBeInstanceOf(HttpError)
  expect(error).toMatchObject({ kind: "http/status", status: 503 })
  expect(cancelled).toBe(1)
})

test("classifies a non-2xx an interceptor short-circuits with as a typed status error", async () => {
  // The interceptor never calls next, so the terminal handler and transport are bypassed entirely.
  const { fetch, calls } = fakeFetch([jsonResponse({ ok: true })])
  const shortCircuit: HttpInterceptor = () => () =>
    Promise.resolve(jsonResponse({ message: "nope" }, 503))
  const client = createHttpClient({
    baseUrl: "https://api.test",
    fetch,
    interceptors: [shortCircuit],
    delay: testDelay().delay,
  })

  await expect(client.request({ path: "x" })).rejects.toMatchObject({
    kind: "http/status",
    status: 503,
  })
  expect(calls.length).toBe(0)
})

test("refuses a body on a GET before encoding or fetching", async () => {
  const { fetch, calls } = fakeFetch([jsonResponse({})])
  const client = createHttpClient({ baseUrl: "https://api.test", fetch, delay: testDelay().delay })

  await expect(client.request({ path: "x", body: { a: 1 } })).rejects.toMatchObject({
    kind: "http/request",
  })
  expect(calls.length).toBe(0)
})

test("redacts credential headers passed to the observability sink", async () => {
  const { fetch } = fakeFetch([jsonResponse({ ok: true })])
  const logged: Array<Record<string, unknown>> = []
  const client = createHttpClient({
    baseUrl: "https://api.test",
    fetch,
    delay: testDelay().delay,
    observability: { onRequest: (r) => logged.push(r.headers) },
  })

  await client.request({ path: "me", headers: { authorization: "Bearer secret" } })

  expect(logged[0]?.authorization).toBe("[REDACTED]")
})

test("wraps a transport failure in a retryable network error", async () => {
  const { fetch } = fakeFetch([new Error("connection reset")])
  const client = createHttpClient({ baseUrl: "https://api.test", fetch, delay: testDelay().delay })

  await expect(client.request({ path: "x" })).rejects.toMatchObject({ kind: "http/network" })
})

test("propagates a fetch abort without masking it as a network error", async () => {
  const abort = new Error("aborted")
  abort.name = "AbortError"
  const { fetch } = fakeFetch([abort])
  const client = createHttpClient({ baseUrl: "https://api.test", fetch, delay: testDelay().delay })

  await expect(client.request({ path: "x" })).rejects.toBe(abort)
})

test("throws a network error when no fetch is available and none is injected", () => {
  vi.stubGlobal("fetch", undefined)
  try {
    expect(() => createHttpClient()).toThrow(HttpError)
  } finally {
    vi.unstubAllGlobals()
  }
})

test("validates the decoded body against a schema and returns the typed value", async () => {
  const { fetch } = fakeFetch([jsonResponse({ id: 1 })])
  const client = createHttpClient({ baseUrl: "https://api.test", fetch, delay: testDelay().delay })

  const response = await client.request({ path: "widgets/1", schema: guardSchema(isWidget) })

  // `response.data` is typed `Widget | undefined` from the schema, not a fabricated cast.
  expect(response.data?.id).toBe(1)
})

test("rejects a body the schema refuses with a typed http/validate error", async () => {
  const { fetch } = fakeFetch([jsonResponse({ id: "not-a-number" })])
  const client = createHttpClient({ baseUrl: "https://api.test", fetch, delay: testDelay().delay })

  const error = await client
    .request({ path: "widgets/1", schema: guardSchema(isWidget, "id must be a number") })
    .catch((e: unknown) => e)

  expect(error).toBeInstanceOf(HttpError)
  expect(error).toMatchObject({ kind: "http/validate" })
  // The validation issues are preserved as `cause` so a caller can inspect what failed.
  expect((error as HttpError).cause).toEqual([{ message: "id must be a number" }])
})

test("runs an async schema validator at the boundary", async () => {
  const { fetch } = fakeFetch([jsonResponse({ id: 5 })])
  const client = createHttpClient({ baseUrl: "https://api.test", fetch, delay: testDelay().delay })
  const asyncSchema = fakeSchema<Widget>(
    (value) => (isWidget(value) ? { value } : { issues: [{ message: "bad" }] }),
    { async: true },
  )

  const response = await client.request({ path: "widgets/5", schema: asyncSchema })

  expect(response.data).toEqual({ id: 5 })
})

test("returns the raw decoded unknown when no schema is supplied", async () => {
  const { fetch } = fakeFetch([jsonResponse({ arbitrary: true })])
  const client = createHttpClient({ baseUrl: "https://api.test", fetch, delay: testDelay().delay })

  const response = await client.request({ path: "x" })

  // No schema: the untrusted body is handed back as `unknown`, never a fabricated caller `T`.
  expect(response.data).toEqual({ arbitrary: true })
})

test("unsafePassthrough opts explicitly into an unchecked typed body", async () => {
  const { fetch } = fakeFetch([jsonResponse({ id: 9 })])
  const client = createHttpClient({ baseUrl: "https://api.test", fetch, delay: testDelay().delay })

  const response = await client.request({ path: "widgets/9", schema: unsafePassthrough<Widget>() })

  expect(response.data?.id).toBe(9)
})

test("skips schema validation for an empty/no-content response", async () => {
  const { fetch } = fakeFetch([new Response(null, { status: 204 })])
  const client = createHttpClient({ baseUrl: "https://api.test", fetch, delay: testDelay().delay })

  // A 204 has no body to validate; a would-reject schema must not fire, and data is `undefined`.
  const response = await client.request({
    path: "widgets/1",
    schema: guardSchema(isWidget, "should not run"),
  })

  expect(response.data).toBeUndefined()
})
