import { createClient } from "@connectrpc/connect"
import { createConnectRpcTransport, mapConnectError } from "@plainworks/connect"
import { connectFailure, connectUnary } from "@plainworks/mocks/connect"
import { EchoService } from "@plainworks/testkit/connect"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, expect, test } from "vitest"

// `@plainworks/mocks/connect` through the published Connect client: every response the mock sends
// decodes to the typed failure a standard Connect server would produce.
const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const echo = (message: string) =>
  createClient(EchoService, createConnectRpcTransport({ baseUrl: "https://api.test" })).echo({
    message,
  })

const failureOf = (call: Promise<unknown>) =>
  call.then(
    () => undefined,
    (cause: unknown) => mapConnectError(cause),
  )

test("answers a valid call and decodes each mocked failure", async () => {
  server.use(
    connectUnary(
      EchoService.method.echo,
      ({ message }) =>
        message === "gone"
          ? connectFailure("not_found", {
              message: "Gone.",
              errorInfo: { reason: "CREDENTIAL_UNAVAILABLE", domain: "example.test" },
            })
          : message === "busy"
            ? connectFailure("unavailable")
            : { message },
      {
        validate: (schema, value) =>
          schema.typeName === "plainworks.testkit.v1.EchoRequest" &&
          (value as { message: string }).message === ""
            ? "message: required"
            : schema.typeName === "plainworks.testkit.v1.EchoResponse" &&
                (value as { message: string }).message === "drift"
              ? "message: forbidden"
              : undefined,
      },
    ),
  )
  await expect(echo("hello")).resolves.toMatchObject({ message: "hello" })
  expect(await failureOf(echo("gone"))).toMatchObject({
    code: "not_found",
    message: "Gone.",
    reason: "CREDENTIAL_UNAVAILABLE",
    domain: "example.test",
    retryable: false,
  })
  expect(await failureOf(echo("busy"))).toMatchObject({ code: "unavailable", retryable: true })
  expect(await failureOf(echo(""))).toMatchObject({
    code: "invalid_argument",
    message: "The request is not valid plainworks.testkit.v1.EchoRequest: message: required",
  })
  expect(await failureOf(echo("drift"))).toMatchObject({
    code: "internal",
    message: "Mock fixture drift in plainworks.testkit.v1.EchoService/Echo: message: forbidden",
  })
})

test("a gate denies the call before the handler runs", async () => {
  server.use(
    connectUnary(EchoService.method.echo, ({ message }) => ({ message }), {
      gate: () => connectFailure("permission_denied"),
    }),
  )
  expect(await failureOf(echo("hi"))).toMatchObject({ code: "permission_denied" })
})
