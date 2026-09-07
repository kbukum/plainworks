import { type RetryPolicy, unsafePassthrough, type WebResponse } from "@plainworks/std"
import {
  autoBackoffDelay,
  fakeAuthHeaderProvider,
  fakeFetch,
  guardSchema,
} from "@plainworks/testkit"
import { expect, test } from "vitest"
import { HttpError } from "../../error"
import { createHttpClient } from "../client"
import type { RequestInput } from "../request-input"

function jsonResponse(data: unknown, status = 200, headers?: Record<string, string>): WebResponse {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })
}

function noContent(): WebResponse {
  return new Response(null, { status: 204 })
}

const retry: RetryPolicy = {
  maxAttempts: 3,
  backoff: { baseMs: 1, maxMs: 5, factor: 2, jitter: "none" },
  idempotent: true,
}

interface Widget {
  readonly id: number
}

function isWidget(value: unknown): value is Widget {
  return typeof value === "object" && value !== null && typeof (value as Widget).id === "number"
}

test("get resolves the decoded body against the base URL", async () => {
  const { fetch, calls } = fakeFetch([jsonResponse({ id: 1 })])
  const client = createHttpClient({ baseUrl: "https://api.test/v1", fetch })

  const data = await client.get("/widgets/1")

  expect(data).toEqual({ id: 1 })
  expect(calls[0]?.url).toBe("https://api.test/v1/widgets/1")
  expect(calls[0]?.init?.method).toBe("GET")
})

test("get validates the untrusted body against a schema and returns the typed value", async () => {
  const { fetch } = fakeFetch([jsonResponse({ id: 7 })])
  const client = createHttpClient({ baseUrl: "https://api.test", fetch })

  const widget = await client.get("/widgets/7", { schema: guardSchema(isWidget) })

  expect(widget?.id).toBe(7)
})

test("get forwards query params and per-request headers", async () => {
  const { fetch, calls } = fakeFetch([jsonResponse([])])
  const client = createHttpClient({ baseUrl: "https://api.test", fetch })

  await client.get("/widgets", { query: { page: 2, tag: ["a", "b"] }, headers: { "x-trace": "r" } })

  expect(calls[0]?.url).toBe("https://api.test/widgets?page=2&tag=a&tag=b")
  expect(new Headers(calls[0]?.init?.headers).get("x-trace")).toBe("r")
})

test("post sends the JSON body and defaults to a single attempt on failure", async () => {
  const { fetch, calls } = fakeFetch([jsonResponse({ error: "busy" }, 503)])
  const client = createHttpClient({
    baseUrl: "https://api.test",
    fetch,
    retry,
    delay: autoBackoffDelay().delay,
  })

  await expect(client.post("/widgets", { body: { name: "x" } })).rejects.toBeInstanceOf(HttpError)
  // A POST without an idempotency key is never auto-retried, even under a retry policy.
  expect(calls).toHaveLength(1)
  expect(calls[0]?.init?.method).toBe("POST")
  expect(String(calls[0]?.init?.body)).toContain('"name":"x"')
})

test("post with an idempotency key sets the header and becomes retry-eligible", async () => {
  const { fetch, calls } = fakeFetch([jsonResponse({}, 503), jsonResponse({ id: 9 })])
  const client = createHttpClient({
    baseUrl: "https://api.test",
    fetch,
    retry,
    delay: autoBackoffDelay().delay,
  })

  const data = await client.post("/widgets", { body: { name: "x" }, idempotencyKey: "key-1" })

  expect(data).toEqual({ id: 9 })
  expect(calls).toHaveLength(2)
  expect(new Headers(calls[0]?.init?.headers).get("idempotency-key")).toBe("key-1")
  // The same key must ride every retry so the server can dedupe the repeated write.
  expect(new Headers(calls[1]?.init?.headers).get("idempotency-key")).toBe("key-1")
})

test("put is idempotent by default and is retried without an idempotency key", async () => {
  const { fetch, calls } = fakeFetch([jsonResponse({}, 503), jsonResponse({ id: 3 })])
  const client = createHttpClient({
    baseUrl: "https://api.test",
    fetch,
    retry,
    delay: autoBackoffDelay().delay,
  })

  const data = await client.put("/widgets/3", {
    body: { id: 3 },
    schema: unsafePassthrough<Widget>(),
  })

  expect(data).toEqual({ id: 3 })
  expect(calls).toHaveLength(2)
})

test("patch is not retried without an idempotency key", async () => {
  const { fetch, calls } = fakeFetch([jsonResponse({}, 503)])
  const client = createHttpClient({
    baseUrl: "https://api.test",
    fetch,
    retry,
    delay: autoBackoffDelay().delay,
  })

  await expect(client.patch("/widgets/1", { body: { name: "y" } })).rejects.toBeInstanceOf(
    HttpError,
  )
  expect(calls).toHaveLength(1)
})

test("patch with an idempotency key merges the header alongside per-request headers", async () => {
  const { fetch, calls } = fakeFetch([jsonResponse({ id: 1 })])
  const client = createHttpClient({ baseUrl: "https://api.test", fetch })

  await client.patch("/widgets/1", {
    body: {},
    headers: { "x-trace": "abc" },
    idempotencyKey: "key-2",
  })

  const sent = new Headers(calls[0]?.init?.headers)
  expect(sent.get("x-trace")).toBe("abc")
  expect(sent.get("idempotency-key")).toBe("key-2")
})

test("write options forward a per-request retry policy, timeout, and signal to request", async () => {
  const { fetch, calls } = fakeFetch([jsonResponse({}, 503), jsonResponse({ id: 5 })])
  const client = createHttpClient({
    baseUrl: "https://api.test",
    fetch,
    delay: autoBackoffDelay().delay,
  })
  const controller = new AbortController()

  const data = await client.post("/widgets", {
    body: { name: "x" },
    idempotencyKey: "key-3",
    retry,
    timeoutMs: 30_000,
    signal: controller.signal,
  })

  expect(data).toEqual({ id: 5 })
  // The per-request retry policy (absent on the client) drives the second attempt.
  expect(calls).toHaveLength(2)
})

test("a wider-typed options value cannot smuggle a body or idempotent flag into a read", async () => {
  const { fetch, calls } = fakeFetch([jsonResponse({ id: 1 })])
  const client = createHttpClient({ baseUrl: "https://api.test", fetch })
  const wider: RequestInput = {
    path: "/widgets/1",
    method: "POST",
    body: { name: "x" },
    idempotent: false,
  }

  await client.get("/widgets/1", wider)

  expect(calls[0]?.init?.method).toBe("GET")
  expect(calls[0]?.init?.body).toBeUndefined()
})

test("a wider-typed options value cannot smuggle idempotent: true into a write without a key", async () => {
  const { fetch, calls } = fakeFetch([jsonResponse({}, 503)])
  const client = createHttpClient({
    baseUrl: "https://api.test",
    fetch,
    retry,
    delay: autoBackoffDelay().delay,
  })
  const wider: RequestInput = { path: "/widgets", method: "POST", idempotent: true }

  await expect(client.post("/widgets", wider)).rejects.toBeInstanceOf(HttpError)

  // The resource-owned flag is stripped, so the keyless write is still never retried.
  expect(calls).toHaveLength(1)
})

test("delete returns undefined on a 204 no-content response", async () => {
  const { fetch, calls } = fakeFetch([noContent()])
  const client = createHttpClient({ baseUrl: "https://api.test", fetch })

  const data = await client.delete("/widgets/3")

  expect(data).toBeUndefined()
  expect(calls[0]?.init?.method).toBe("DELETE")
})

test("resource methods reuse the client's auth-header injection", async () => {
  const { fetch, calls } = fakeFetch([jsonResponse({ id: 1 })])
  const auth = fakeAuthHeaderProvider({ headers: { authorization: "Bearer t" } })
  const client = createHttpClient({
    baseUrl: "https://api.test",
    fetch,
    authProvider: auth.provider,
  })

  await client.get("/widgets/1")

  expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe("Bearer t")
  expect(auth.calls).toBe(1)
})
