import { Code, ConnectError, createClient } from "@connectrpc/connect"
import type { WebResponse } from "@plainworks/std"
import { fakeAuthHeaderProvider, fakeFetch, manualDelay } from "@plainworks/testkit"
import { EchoService } from "@plainworks/testkit/connect"
import { describe, expect, test } from "vitest"
import { createConnectRpcTransport } from "./transport"

const BASE_URL = "https://api.test"

function jsonResponse(body: unknown, status = 200): WebResponse {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

describe("createConnectRpcTransport", () => {
  test("decodes a unary response and injects the auth header on the wire", async () => {
    const network = fakeFetch([jsonResponse({ message: "pong" })])
    const auth = fakeAuthHeaderProvider({ headers: { authorization: "Bearer test-token" } })
    const transport = createConnectRpcTransport({
      baseUrl: BASE_URL,
      authProvider: auth.provider,
      fetch: network.fetch,
    })

    const response = await createClient(EchoService, transport).echo({ message: "ping" })

    expect(response.message).toBe("pong")
    const header = new Headers(network.calls[0]?.init?.headers)
    expect(header.get("authorization")).toBe("Bearer test-token")
  })

  test("bounds a hung call with the per-attempt timeout as deadline_exceeded", async () => {
    const network = fakeFetch(["hang"])
    const manual = manualDelay()
    const transport = createConnectRpcTransport({
      baseUrl: BASE_URL,
      timeoutMs: 1000,
      fetch: network.fetch,
      delay: manual.delay,
    })

    const promise = createClient(EchoService, transport)
      .echo({ message: "ping" })
      .catch((reason: unknown) => reason)
    await Promise.resolve()
    manual.fireNext()

    const error = await promise
    expect(error).toBeInstanceOf(ConnectError)
    expect((error as ConnectError).code).toBe(Code.DeadlineExceeded)
  })

  test("never retries a non-idempotent write", async () => {
    const network = fakeFetch([jsonResponse({ code: "unavailable", message: "down" }, 503)])
    const transport = createConnectRpcTransport({
      baseUrl: BASE_URL,
      retry: { maxAttempts: 3, backoff: { baseMs: 10, maxMs: 100, factor: 2, jitter: "none" } },
      fetch: network.fetch,
    })

    const error = await createClient(EchoService, transport)
      .mutate({ message: "write" })
      .catch((reason: unknown) => reason)

    expect((error as ConnectError).code).toBe(Code.Unavailable)
    expect(network.calls).toHaveLength(1)
  })

  test("selects the gRPC-Web protocol and honors the fetch override", async () => {
    const network = fakeFetch(["hang"])
    const transport = createConnectRpcTransport({
      baseUrl: BASE_URL,
      protocol: "grpc-web",
      fetch: network.fetch,
    })

    // The fake hangs on purpose; own its lifetime — abort once the request is inspected and await
    // the rejection so no timer or pending fetch outlives the test.
    const abort = new AbortController()
    const promise = createClient(EchoService, transport)
      .echo({ message: "ping" }, { signal: abort.signal })
      .catch((reason: unknown) => reason)
    await Promise.resolve()

    const header = new Headers(network.calls[0]?.init?.headers)
    expect(header.get("content-type")).toMatch(/^application\/grpc-web/)

    abort.abort()
    const error = await promise
    expect(error).toBeInstanceOf(ConnectError)
  })
})
