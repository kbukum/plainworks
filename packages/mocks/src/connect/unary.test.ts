import { BinaryReader, base64Decode } from "@bufbuild/protobuf/wire"
import type { FailureCode } from "@plainworks/std/failure"
import { EchoService } from "@plainworks/testkit/connect"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { type ConnectUnaryOptions, connectFailure, connectUnary } from "./unary"

// Wire-level checks. internal/integration drives the same handler through the published Connect
// client and proves each response decodes to the typed failure named here.
const ENDPOINT = "https://api.test/plainworks.testkit.v1.EchoService/Echo"
const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function serve(options: ConnectUnaryOptions = {}) {
  server.use(
    connectUnary(
      EchoService.method.echo,
      ({ message }) => (message === "fail" ? connectFailure("not_found") : { message }),
      options,
    ),
  )
}

const post = (body: string | ReadableStream<Uint8Array>, init: RequestInit = {}) =>
  fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    ...init,
  })

const echo = (message: string) => post(JSON.stringify({ message }))

async function wire(response: Response) {
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

describe("connectUnary", () => {
  it("answers a valid request with the output message as Connect JSON", async () => {
    serve()
    expect(await wire(await echo("hello"))).toEqual({ status: 200, body: { message: "hello" } })
  })

  it("passes a handler's failure response through", async () => {
    serve()
    expect(await wire(await echo("fail"))).toMatchObject({
      status: 404,
      body: { code: "not_found" },
    })
  })

  it("rejects malformed JSON as invalid_argument, without an input failure", async () => {
    serve()
    expect(await wire(await post("{not json"))).toEqual({
      status: 400,
      body: {
        code: "invalid_argument",
        message: "The request body is not valid JSON for plainworks.testkit.v1.EchoRequest.",
      },
    })
  })

  it("rejects JSON the input schema does not know as invalid_argument", async () => {
    serve()
    expect(await wire(await post(JSON.stringify({ unknown: 1 })))).toMatchObject({
      status: 400,
      body: { code: "invalid_argument" },
    })
  })

  it("rejects contract-invalid input as invalid_argument with the violation", async () => {
    serve({
      validate: (schema, message) =>
        schema.typeName === "plainworks.testkit.v1.EchoRequest" &&
        (message as { message?: string }).message === ""
          ? "message: required"
          : undefined,
    })
    expect(await wire(await echo(""))).toEqual({
      status: 400,
      body: {
        code: "invalid_argument",
        message: "The request is not valid plainworks.testkit.v1.EchoRequest: message: required",
      },
    })
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses maxBodyBytes %s when the handler is built",
    (maxBodyBytes) => {
      expect(() => connectUnary(EchoService.method.echo, () => ({}), { maxBodyBytes })).toThrow(
        RangeError,
      )
    },
  )

  it("rejects a declared length over the limit as resource_exhausted", async () => {
    serve({ maxBodyBytes: 16 })
    const response = await post("{}", {
      headers: { "content-type": "application/json", "content-length": "1048576" },
    })
    expect(await wire(response)).toMatchObject({
      status: 429,
      body: { code: "resource_exhausted" },
    })
  })

  it("bounds a streamed body that declares no length", async () => {
    serve({ maxBodyBytes: 16 })
    const chunk = new TextEncoder().encode(JSON.stringify({ message: "x".repeat(64) }))
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk)
        controller.close()
      },
    })
    const response = await post(body, { duplex: "half" } as RequestInit)
    expect(response.status).toBe(429)
  })

  it("fails loudly when the handler returns output the contract forbids", async () => {
    serve({
      validate: (schema) =>
        schema.typeName === "plainworks.testkit.v1.EchoResponse" ? "message: too long" : undefined,
    })
    expect(await wire(await echo("hi"))).toEqual({
      status: 500,
      body: {
        code: "internal",
        message: "Mock fixture drift in plainworks.testkit.v1.EchoService/Echo: message: too long",
      },
    })
  })

  it("lets a gate answer before the request body is read", async () => {
    let denied = true
    serve({ gate: () => (denied ? connectFailure("permission_denied") : undefined) })
    expect((await echo("hi")).status).toBe(403)
    denied = false
    expect((await echo("hi")).status).toBe(200)
  })
})

describe("connectFailure", () => {
  it("sends the code's status and Connect JSON without details by default", async () => {
    expect(await wire(connectFailure("not_found"))).toEqual({
      status: 404,
      body: { code: "not_found", message: "The request failed: not_found." },
    })
  })

  it("encodes the requested standard details in order", async () => {
    const response = connectFailure("invalid_argument", {
      message: "Fix the form.",
      errorInfo: {
        reason: "PROFILE_INVALID",
        domain: "example.test",
        metadata: { b: "2", a: "1" },
      },
      violations: [{ field: "name", description: "Taken.", reason: "DUPLICATE" }],
      retryAfterMs: 1_500,
    })
    const { status, body } = await wire(response)
    expect(status).toBe(400)
    const details = body.details as { type: string; value: string }[]
    expect(details.map(({ type }) => type)).toEqual([
      "google.rpc.ErrorInfo",
      "google.rpc.BadRequest",
      "google.rpc.RetryInfo",
    ])
    const [info, , retry] = details.map(({ value }) => new BinaryReader(base64Decode(value)))
    expect([info?.uint32(), info?.string(), info?.uint32(), info?.string()]).toEqual([
      10,
      "PROFILE_INVALID",
      18,
      "example.test",
    ])
    retry?.uint32()
    const duration = new BinaryReader(retry?.bytes() ?? new Uint8Array())
    expect([duration.uint32(), duration.int64(), duration.uint32(), duration.int32()]).toEqual([
      8,
      1n,
      16,
      500_000_000,
    ])
  })

  it.each([
    ["an unknown code", () => connectFailure("NOT_A_CODE" as FailureCode)],
    [
      "an empty reason",
      () => connectFailure("internal", { errorInfo: { reason: "", domain: "d" } }),
    ],
    ["a negative delay", () => connectFailure("unavailable", { retryAfterMs: -1 })],
  ])("refuses %s", (_name, build) => {
    expect(build).toThrow(RangeError)
  })
})
