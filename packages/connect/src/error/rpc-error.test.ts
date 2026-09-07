import { Code, ConnectError } from "@connectrpc/connect"
import { EchoResponseSchema } from "@plainworks/testkit/connect"
import { describe, expect, test } from "vitest"
import { isRpcError, mapConnectError, RpcError } from "./rpc-error"

describe("mapConnectError", () => {
  test("maps a ConnectError to a typed RpcError preserving code, kind, cause, metadata, and details", () => {
    const metadata = new Headers({ "x-trace": "abc" })
    const details = [{ desc: EchoResponseSchema, value: { message: "detail" } }]
    const source = new ConnectError("not here", Code.NotFound, metadata, details)

    const error = mapConnectError(source)

    expect(error).toBeInstanceOf(RpcError)
    expect(error.code).toBe("not_found")
    expect(error.kind).toBe("connect/not_found")
    expect(error.rawCode).toBe(Code.NotFound)
    expect(error.cause).toBe(source)
    expect(error.metadata.get("x-trace")).toBe("abc")
    expect(error.details[0]).toBe(details[0])
  })

  test("normalizes a non-Connect throwable to the unknown code", () => {
    const error = mapConnectError(new TypeError("boom"))

    expect(error).toBeInstanceOf(RpcError)
    expect(error.code).toBe("unknown")
    expect(error.rawCode).toBe(Code.Unknown)
    expect(error.details).toEqual([])
  })
})

describe("isRpcError", () => {
  test("narrows an RpcError and rejects other values", () => {
    expect(isRpcError(mapConnectError(new ConnectError("x", Code.Internal)))).toBe(true)
    expect(isRpcError(new Error("x"))).toBe(false)
    expect(isRpcError(undefined)).toBe(false)
  })
})

describe("RpcError", () => {
  test("derives the string code from the raw code so contradictory pairings are unrepresentable", () => {
    const error = new RpcError("bare", { rawCode: Code.Internal })

    expect(error.code).toBe("internal")
    expect(error.kind).toBe("connect/internal")
    expect(error.details).toEqual([])
    expect([...error.metadata]).toEqual([])
    expect(error.cause).toBeUndefined()
  })
})
