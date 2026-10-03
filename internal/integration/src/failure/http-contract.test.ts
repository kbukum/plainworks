import { createHttpClient } from "@plainworks/http"
import { wireFailures } from "@plainworks/mocks/failure"
import { fakeFetch } from "@plainworks/testkit/fakes"
import { expect, test } from "vitest"

for (const { wire } of wireFailures) {
  test(`decodes problem JSON: ${wire.name}`, async () => {
    const { fetch } = fakeFetch([
      new Response(JSON.stringify(wire.problemJson), {
        status: wire.httpStatus,
        headers: { "content-type": "application/problem+json; charset=utf-8" },
      }),
    ])
    const client = createHttpClient({ baseUrl: "https://api.test", fetch })
    await expect(client.get("/")).rejects.toMatchObject({
      ...wire.vocabulary,
      status: wire.httpStatus,
    })
  })
}

test("malformed problem details remain an operational failure with no field prompts", async () => {
  const { fetch } = fakeFetch([
    new Response(
      '{"type":"https://gokit.dev/errors/invalid-input","code":"INVALID_INPUT","retryable":"false"}',
      {
        status: 422,
        headers: { "content-type": "application/problem+json" },
      },
    ),
  ])
  await expect(
    createHttpClient({ baseUrl: "https://api.test", fetch }).get("/"),
  ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE_ERROR", retryable: false, violations: [] })
})

test.each([
  { type: "https://other.example/errors/invalid-input", code: "INVALID_INPUT" },
  { type: "https://gokit.dev/errors/future-code", code: "FUTURE_CODE" },
])("foreign/unknown problem identity preserves HTTP status: $type", async (identity) => {
  const { fetch } = fakeFetch([
    new Response(
      JSON.stringify({
        ...identity,
        status: 403,
        detail: "Denied",
        retryable: true,
      }),
      { status: 403, headers: { "content-type": "application/problem+json" } },
    ),
  ])
  await expect(
    createHttpClient({ baseUrl: "https://api.test", fetch }).get("/"),
  ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN", retryable: false, violations: [] })
})

test("terminal HTTP authentication cannot be made retryable by the body", async () => {
  const { fetch } = fakeFetch([
    new Response(
      JSON.stringify({
        type: "https://gokit.dev/errors/unauthorized",
        code: "UNAUTHORIZED",
        status: 401,
        detail: "Sign in",
        retryable: true,
        retryAfter: 1,
      }),
      { status: 401, headers: { "content-type": "application/problem+json" } },
    ),
  ])
  await expect(
    createHttpClient({ baseUrl: "https://api.test", fetch }).get("/"),
  ).rejects.toMatchObject({
    status: 401,
    code: "UNAUTHORIZED",
    retryable: false,
    retryAfterMs: undefined,
    authentication: "unauthenticated",
  })
})
