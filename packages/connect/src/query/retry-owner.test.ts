import { Code, ConnectError } from "@connectrpc/connect"
import { createFakeConnectTransport, EchoService } from "@plainworks/testkit/connect"
import { QueryClient } from "@tanstack/query-core"
import { expect, test } from "vitest"
import { createInfiniteQueryOptions, createQueryOptions, skipToken } from "./index"

test("query defaults cannot retry a permanent RPC failure; reset is a fresh call", async () => {
  const method = EchoService.method.echo
  const fake = createFakeConnectTransport(EchoService).unary(method, () => {
    throw new ConnectError("Missing", Code.NotFound)
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: 3, retryDelay: 0 } } })
  const options = createQueryOptions(method, {}, { transport: fake.transport })
  try {
    await expect(client.fetchQuery(options)).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(fake.calls).toHaveLength(1)
    await client.resetQueries({ queryKey: options.queryKey })
    await expect(client.fetchQuery(options)).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(fake.calls).toHaveLength(2)
  } finally {
    client.clear()
  }
})

test("infinite query defaults cannot add a second retry loop", async () => {
  const method = EchoService.method.echo
  const fake = createFakeConnectTransport(EchoService).unary(method, () => {
    throw new ConnectError("Missing", Code.NotFound)
  })

  const client = new QueryClient({ defaultOptions: { queries: { retry: 2, retryDelay: 0 } } })
  try {
    const options = createInfiniteQueryOptions(
      method,
      { message: "" },
      {
        transport: fake.transport,
        pageParamKey: "message",
        getNextPageParam: () => undefined,
      },
    )
    await expect(client.fetchInfiniteQuery(options)).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(fake.calls).toHaveLength(1)
  } finally {
    client.clear()
  }
})

test("skipped finite and infinite queries preserve skipToken", () => {
  const fake = createFakeConnectTransport(EchoService)
  expect(
    createQueryOptions(EchoService.method.echo, skipToken, { transport: fake.transport }),
  ).toMatchObject({ queryFn: skipToken, retry: false })
  expect(
    createInfiniteQueryOptions(EchoService.method.echo, skipToken, {
      transport: fake.transport,
      pageParamKey: "message",
      getNextPageParam: () => undefined,
    }),
  ).toMatchObject({ queryFn: skipToken, retry: false })
  expect(fake.calls).toHaveLength(0)
})
