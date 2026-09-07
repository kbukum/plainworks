import { createConnectQueryKey } from "@connectrpc/connect-query-core"
import { EchoService, echoResponse } from "@plainworks/testkit/connect"
import { QueryClient } from "@tanstack/query-core"
import { describe, expect, test } from "vitest"
import { createInvalidator } from "./invalidate"

const echo = EchoService.method.echo

function seed(client: QueryClient, input?: { message: string }) {
  const finite = createConnectQueryKey({
    schema: echo,
    cardinality: "finite",
    ...(input !== undefined ? { input } : {}),
  })
  const infinite = createConnectQueryKey({
    schema: echo,
    cardinality: "infinite",
    ...(input !== undefined ? { input } : {}),
  })
  client.setQueryData(finite, echoResponse("cached"))
  client.setQueryData(infinite, { pages: [], pageParams: [] })
  return { finite, infinite }
}

describe("createInvalidator", () => {
  test("prefix-matches both finite and infinite queries for the method", async () => {
    const client = new QueryClient()
    const { finite, infinite } = seed(client)

    await createInvalidator(client)(echo)

    expect(client.getQueryState(finite)?.isInvalidated).toBe(true)
    expect(client.getQueryState(infinite)?.isInvalidated).toBe(true)
  })

  test("restricts invalidation to a specific input when given", async () => {
    const client = new QueryClient()
    const ping = seed(client, { message: "ping" })
    const pong = seed(client, { message: "pong" })

    await createInvalidator(client)(echo, { input: { message: "ping" } })

    expect(client.getQueryState(ping.finite)?.isInvalidated).toBe(true)
    expect(client.getQueryState(pong.finite)?.isInvalidated).toBe(false)
  })
})
