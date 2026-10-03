import { wireFailures } from "@plainworks/mocks/failure"
import type { WebResponse } from "@plainworks/std/web"
import { autoBackoffDelay, flushMicrotasks } from "@plainworks/testkit"
import { EchoService } from "@plainworks/testkit/connect"
import { fakeFetch } from "@plainworks/testkit/fakes"
import { QueryClient } from "@tanstack/query-core"
import { expect, test, vi } from "vitest"
import { createConnectRpcTransport } from "../transport"
import { createQueryOptions } from "./rpc-options"

function failure(name: string): WebResponse {
  const fixture = wireFailures.find(({ wire }) => wire.name === name)
  if (fixture === undefined) throw new Error(`Missing fixture ${name}`)
  return new Response(JSON.stringify(fixture.wire.connectJson), {
    status: fixture.wire.httpStatus,
    headers: { "content-type": "application/json" },
  })
}

test.each([
  ["service_unavailable_retry_disabled", 1],
  ["service_unavailable_retry_no_delay", 3],
  ["unauthorized", 1],
] as const)("one retry owner for %s", async (name, attempts) => {
  const network = fakeFetch(Array.from({ length: 6 }, () => failure(name)))
  const transport = createConnectRpcTransport({
    baseUrl: "https://api.test",
    fetch: network.fetch,
    retry: {
      maxAttempts: 3,
      budgetMs: 1000,
      backoff: { baseMs: 10, maxMs: 100, factor: 2, jitter: "none" },
    },
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
