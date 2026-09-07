import { ConnectError, createClient } from "@connectrpc/connect"
import { describe, expect, test } from "vitest"
import { flushMicrotasks } from "../async"
import { manualDelay } from "../delay"
import { createFakeConnectTransport } from "./fake-transport"
import { EchoService, echoResponse } from "./fixtures"
import { Code, failUnary } from "./responder"

describe("createFakeConnectTransport", () => {
  test("routes a unary call to its canned responder and records the call", async () => {
    const fake = createFakeConnectTransport(EchoService).unary(
      EchoService.method.echo,
      (request) => ({ message: `echo: ${request.message}` }),
    )
    const client = createClient(EchoService, fake.transport)

    const response = await client.echo(
      { message: "hi" },
      { headers: { authorization: "Bearer token" } },
    )

    expect(response.message).toBe("echo: hi")
    expect(fake.calls).toHaveLength(1)
    const [call] = fake.calls
    expect(call?.service).toBe("plainworks.testkit.v1.EchoService")
    expect(call?.method).toBe("Echo")
    expect(call?.stream).toBe(false)
    expect(call?.input).toMatchObject({ message: "hi" })
    expect(call?.header.get("authorization")).toBe("Bearer token")
  })

  test("fails a unary call with the configured typed ConnectError code", async () => {
    const fake = createFakeConnectTransport(EchoService).unary(
      EchoService.method.echo,
      failUnary(Code.Unavailable, "backend down"),
    )
    const client = createClient(EchoService, fake.transport)

    const error = await client.echo({ message: "x" }).catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(ConnectError)
    expect((error as ConnectError).code).toBe(Code.Unavailable)
    expect((error as ConnectError).rawMessage).toBe("backend down")
  })

  test("streams server responses and records the call as a stream", async () => {
    const fake = createFakeConnectTransport(EchoService).serverStream(
      EchoService.method.count,
      async function* (request) {
        for (let value = 1; value <= request.count; value++) {
          yield { value }
        }
      },
    )
    const client = createClient(EchoService, fake.transport)

    const received: number[] = []
    for await (const response of client.count({ count: 3 })) {
      received.push(response.value)
    }

    expect(received).toEqual([1, 2, 3])
    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0]?.stream).toBe(true)
  })

  test("a slow responder parks the response until the injected delay fires", async () => {
    const manual = manualDelay()
    const fake = createFakeConnectTransport(EchoService).unary(
      EchoService.method.echo,
      async (request) => {
        await manual.delay(1000)
        return echoResponse(request.message)
      },
    )
    const client = createClient(EchoService, fake.transport)

    let settled = false
    const pending = client.echo({ message: "later" }).then((response) => {
      settled = true
      return response
    })
    await flushMicrotasks()
    expect(settled).toBe(false)
    expect(manual.waits).toEqual([1000])

    expect(manual.fireNext()).toBe(true)
    await expect(pending).resolves.toMatchObject({ message: "later" })
  })

  test("an unregistered method responds unimplemented", async () => {
    const fake = createFakeConnectTransport(EchoService)
    const client = createClient(EchoService, fake.transport)

    const error = await client.mutate({ message: "x" }).catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(ConnectError)
    expect((error as ConnectError).code).toBe(Code.Unimplemented)
    expect(fake.calls).toHaveLength(0)
  })

  test("rejects a responder registered after the transport has been read", () => {
    const fake = createFakeConnectTransport(EchoService)
    // Build and cache the router by reading `transport`.
    void fake.transport

    expect(() =>
      fake.unary(EchoService.method.echo, (request) => ({ message: request.message })),
    ).toThrow(/after `transport` has been read/)
    expect(() =>
      fake.serverStream(EchoService.method.count, async function* () {
        yield { value: 1 }
      }),
    ).toThrow(/after `transport` has been read/)
  })
})
