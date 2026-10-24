import { Code, ConnectError } from "@connectrpc/connect"
import type { WebResponse } from "@plainworks/std/web"
import { autoBackoffDelay, flushMicrotasks } from "@plainworks/testkit"
import { EchoService } from "@plainworks/testkit/connect"
import { fakeFetch } from "@plainworks/testkit/fakes"
import { QueryClient } from "@tanstack/query-core"
import { expect, test, vi } from "vitest"
import { decodeRpcFailure } from "../errors"
import { RetryInfoSchema } from "../errors/gen/google/rpc/error_details_pb"
import { connectFailureJson } from "../testing"
import { createConnectRpcTransport } from "../transport"
import { createQueryOptions } from "./rpc-options"

// Standard failure shapes this retry policy reacts to, built with connect's own wire encoder.
const failures = {
  unavailable: [Code.Unavailable, 503, false],
  permission_denied: [Code.PermissionDenied, 403, false],
  resource_exhausted_retry_info: [Code.ResourceExhausted, 429, true],
  unauthenticated_retry_info: [Code.Unauthenticated, 401, true],
} as const

function failure(name: keyof typeof failures): WebResponse {
  const [code, status, retryInfo] = failures[name]
  const error = new ConnectError(
    name,
    code,
    undefined,
    retryInfo ? [{ desc: RetryInfoSchema, value: { retryDelay: { nanos: 1_000_000 } } }] : [],
  )
  return new Response(JSON.stringify(connectFailureJson(error)), {
    status,
    headers: { "content-type": "application/json" },
  })
}

const retry = {
  maxAttempts: 3,
  budgetMs: 1000,
  backoff: { baseMs: 10, maxMs: 100, factor: 2, jitter: "none" },
} as const

test.each([
  ["unavailable", 3],
  ["permission_denied", 1],
  ["resource_exhausted_retry_info", 3],
  ["unauthenticated_retry_info", 1],
] as const)("one retry owner for %s", async (name, attempts) => {
  const network = fakeFetch(Array.from({ length: 6 }, () => failure(name)))
  const transport = createConnectRpcTransport({
    baseUrl: "https://api.test",
    fetch: network.fetch,
    retry,
    delay: autoBackoffDelay().delay,
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: 5, retryDelay: 0 } } })
  try {
    await expect(
      client.fetchQuery(createQueryOptions(EchoService.method.echo, {}, { transport })),
    ).rejects.toBeInstanceOf(Error)
    expect(network.calls).toHaveLength(attempts)
  } finally {
    client.clear()
  }
})

test("an injected decoder owns the retry verdict and the surfaced failure", async () => {
  const network = fakeFetch(Array.from({ length: 6 }, () => failure("unavailable")))
  const transport = createConnectRpcTransport({
    baseUrl: "https://api.test",
    fetch: network.fetch,
    retry,
    delay: autoBackoffDelay().delay,
    failures: (input) => ({ ...decodeRpcFailure(input), retryable: false, reason: "PAUSED" }),
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: 5, retryDelay: 0 } } })
  try {
    await expect(
      client.fetchQuery(createQueryOptions(EchoService.method.echo, {}, { transport })),
    ).rejects.toMatchObject({ code: "unavailable", retryable: false, reason: "PAUSED" })
    expect(network.calls).toHaveLength(1)
  } finally {
    client.clear()
  }
})

test("cancel stops one in-flight wire attempt and reset starts exactly one fresh call", async () => {
  const network = fakeFetch([
    "hang",
    new Response('{"message":"reset"}', {
      headers: { "content-type": "application/json" },
    }),
  ])
  const transport = createConnectRpcTransport({ baseUrl: "https://api.test", fetch: network.fetch })
  const client = new QueryClient({ defaultOptions: { queries: { retry: 5 } } })
  const options = createQueryOptions(EchoService.method.echo, {}, { transport })
  try {
    const pending = client.fetchQuery(options).catch((error: unknown) => error)
    await flushMicrotasks()
    await client.cancelQueries({ queryKey: options.queryKey })
    await pending
    expect(network.calls).toHaveLength(1)
    await client.resetQueries({ queryKey: options.queryKey })
    await expect(client.fetchQuery(options)).resolves.toMatchObject({ message: "reset" })
    expect(network.calls).toHaveLength(2)
  } finally {
    client.clear()
  }
})

test("the total budget includes admission before any wire attempt", async () => {
  vi.useFakeTimers()
  try {
    const network = fakeFetch([])
    const transport = createConnectRpcTransport({
      baseUrl: "https://api.test",
      fetch: network.fetch,
      timeoutMs: 1000,
      retry: {
        maxAttempts: 3,
        budgetMs: 50,
        backoff: { baseMs: 10, maxMs: 100, factor: 2, jitter: "none" },
      },
      interceptors: [() => () => new Promise(() => {})],
    })
    const client = new QueryClient()
    try {
      const pending = client
        .fetchQuery(createQueryOptions(EchoService.method.echo, {}, { transport }))
        .catch((error: unknown) => error)
      await vi.advanceTimersByTimeAsync(50)
      expect(await pending).toBeInstanceOf(Error)
      expect(network.calls).toHaveLength(0)
    } finally {
      client.clear()
    }
  } finally {
    vi.useRealTimers()
  }
})
