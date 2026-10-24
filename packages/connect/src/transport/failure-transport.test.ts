import { Code, ConnectError, createClient } from "@connectrpc/connect"
import { createFakeConnectTransport, EchoService } from "@plainworks/testkit/connect"
import { expect, test } from "vitest"
import { RpcError } from "../errors"
import { failureTransport } from "./failure-transport"

test("stream messages preserve data and translate a later failure", async () => {
  const fake = createFakeConnectTransport(EchoService).serverStream(
    EchoService.method.count,
    async function* () {
      yield { value: 1 }
      throw new ConnectError("Unavailable", Code.Unavailable)
    },
  )
  const stream = createClient(EchoService, failureTransport(fake.transport)).count({})
  const iterator = stream[Symbol.asyncIterator]()
  expect((await iterator.next()).value).toMatchObject({ value: 1 })
  await expect(iterator.next()).rejects.toMatchObject({ code: "unavailable" })
})

test("failed stream start exposes a typed failure", async () => {
  const fake = createFakeConnectTransport(EchoService).serverStream(
    EchoService.method.count,
    () => {
      throw new ConnectError("Missing", Code.NotFound)
    },
  )
  const stream = createClient(EchoService, failureTransport(fake.transport)).count({})
  await expect(stream[Symbol.asyncIterator]().next()).rejects.toMatchObject({ code: "not_found" })
})

test.each([
  ["unauthenticated", Code.Unauthenticated, undefined],
  ["a decoder-reported session outage", Code.Unavailable, "unavailable"],
] as const)("%s invalidates the protected session", async (_, code, authentication) => {
  const fake = createFakeConnectTransport(EchoService).unary(EchoService.method.echo, () => {
    throw new ConnectError("Session", code)
  })
  const invalidated: unknown[] = []
  const session = {
    acquire: () => Promise.reject(new Error("unused")),
    revalidate: () => Promise.resolve(),
    invalidate: (cause: unknown) => invalidated.push(cause),
  }
  const transport = failureTransport(fake.transport, {
    session,
    failures: (input) => ({ ...input, violations: [], retryable: false, authentication }),
  })
  await expect(createClient(EchoService, transport).echo({})).rejects.toBeInstanceOf(RpcError)
  expect(invalidated).toHaveLength(1)
})

test("an ordinary failure leaves the session alone", async () => {
  const fake = createFakeConnectTransport(EchoService).unary(EchoService.method.echo, () => {
    throw new ConnectError("Down", Code.Unavailable)
  })
  const invalidated: unknown[] = []
  const transport = failureTransport(fake.transport, {
    session: {
      acquire: () => Promise.reject(new Error("unused")),
      revalidate: () => Promise.resolve(),
      invalidate: (cause: unknown) => invalidated.push(cause),
    },
  })
  await expect(createClient(EchoService, transport).echo({})).rejects.toMatchObject({
    code: "unavailable",
  })
  expect(invalidated).toEqual([])
})
