import { createFakeConnectTransport, EchoService } from "@plainworks/testkit/connect"
import { describe, expect, test } from "vitest"
import { createQueryKey } from "./query-key"

const echo = EchoService.method.echo

describe("createQueryKey", () => {
  test("is deterministic for equal schema and input", () => {
    const a = createQueryKey({ schema: echo, input: { message: "ping" } })
    const b = createQueryKey({ schema: echo, input: { message: "ping" } })
    expect(a).toEqual(b)
  })

  test("differs when the input differs", () => {
    const a = createQueryKey({ schema: echo, input: { message: "ping" } })
    const b = createQueryKey({ schema: echo, input: { message: "pong" } })
    expect(a).not.toEqual(b)
  })

  test("is transport-scoped (connect-n1)", () => {
    const one = createFakeConnectTransport(EchoService).transport
    const two = createFakeConnectTransport(EchoService).transport
    const scoped = createQueryKey({ schema: echo, input: { message: "ping" }, transport: one })
    const same = createQueryKey({ schema: echo, input: { message: "ping" }, transport: one })
    const other = createQueryKey({ schema: echo, input: { message: "ping" }, transport: two })
    expect(scoped).toEqual(same)
    expect(scoped).not.toEqual(other)
  })
})
