import { createClient } from "@connectrpc/connect"
import { createConnectRpcTransport, mapConnectError } from "@plainworks/connect"
import { connectFailure } from "@plainworks/mocks/connect"
import { failureCodes, httpStatusFor } from "@plainworks/std/failure"
import { EchoService } from "@plainworks/testkit/connect"
import { fakeFetch } from "@plainworks/testkit/fakes"
import { expect, test } from "vitest"

const failureOf = async (response: Response) => {
  const { fetch } = fakeFetch([response])
  const client = createClient(
    EchoService,
    createConnectRpcTransport({ baseUrl: "https://api.test", fetch }),
  )
  return client.echo({}).then(
    () => undefined,
    (cause: unknown) => mapConnectError(cause),
  )
}

// Every canonical code, sent as the Connect protocol carries it, decodes through the published
// transport to the same code with the standard retry verdict.
test.each(failureCodes)("decodes the canonical Connect code %s", async (code) => {
  const response = connectFailure(code, { message: `Failed: ${code}.` })
  expect(response.status).toBe(httpStatusFor(code))
  expect(await failureOf(response)).toMatchObject({
    code,
    message: `Failed: ${code}.`,
    retryable: code === "unavailable",
  })
})

test("decodes the standard google.rpc details", async () => {
  expect(
    await failureOf(
      connectFailure("invalid_argument", {
        message: "Fix the form.",
        errorInfo: { reason: "PROFILE_INVALID", domain: "example.test", metadata: { tier: "pro" } },
        violations: [{ field: "name", description: "Taken.", reason: "DUPLICATE" }],
        retryAfterMs: 1_500,
      }),
    ),
  ).toMatchObject({
    code: "invalid_argument",
    reason: "PROFILE_INVALID",
    domain: "example.test",
    metadata: { tier: "pro" },
    violations: [{ field: "name", message: "Taken.", reason: "DUPLICATE" }],
    retryable: true,
    retryAfterMs: 1_500,
  })
})
