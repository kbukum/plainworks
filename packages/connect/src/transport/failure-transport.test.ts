import { Code, ConnectError, createClient } from "@connectrpc/connect"
import { createFakeConnectTransport, EchoService } from "@plainworks/testkit/connect"
import { expect, test } from "vitest"
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
  await expect(iterator.next()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" })
})

test("failed stream start exposes a typed failure", async () => {
  const fake = createFakeConnectTransport(EchoService).serverStream(
    EchoService.method.count,
    () => {
      throw new ConnectError("Missing", Code.NotFound)
    },
  )
  const stream = createClient(EchoService, failureTransport(fake.transport)).count({})
  await expect(stream[Symbol.asyncIterator]().next()).rejects.toMatchObject({ code: "NOT_FOUND" })
})
