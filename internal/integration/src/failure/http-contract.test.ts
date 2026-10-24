import { createHttpClient } from "@plainworks/http"
import { problemJson } from "@plainworks/mocks/failure"
import { fakeFetch } from "@plainworks/testkit/fakes"
import { expect, test } from "vitest"

const failureOf = (body: unknown, status: number, headers: Record<string, string> = {}) => {
  const { fetch } = fakeFetch([
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/problem+json; charset=utf-8", ...headers },
    }),
  ])
  return createHttpClient({ baseUrl: "https://api.test", fetch }).get("/")
}

test.each([
  { status: 400, code: "invalid_argument", retryable: false },
  { status: 403, code: "permission_denied", retryable: false },
  { status: 404, code: "not_found", retryable: false },
  { status: 409, code: "aborted", retryable: false },
  { status: 429, code: "resource_exhausted", retryable: true },
  { status: 503, code: "unavailable", retryable: true },
])("decodes an RFC 9457 problem: $status", async ({ status, code, retryable }) => {
  await expect(
    failureOf(
      problemJson(status, {
        type: "https://example.test/problem",
        detail: "Explained.",
        extensions: { resource: "user" },
      }),
      status,
    ),
  ).rejects.toMatchObject({
    status,
    code,
    retryable,
    message: "Explained.",
    reason: "https://example.test/problem",
    metadata: { resource: "user" },
  })
})

test("a malformed problem is an operational failure with no field prompts", async () => {
  await expect(failureOf('{"type":42,"status":422}', 422)).rejects.toMatchObject({
    kind: "http/decode",
    code: "internal",
    retryable: false,
    violations: [],
  })
})

test("terminal HTTP authentication cannot be made retryable by the body", async () => {
  await expect(
    failureOf(
      problemJson(401, { detail: "Sign in", extensions: { retryable: true, retryAfter: 1 } }),
      401,
      { "retry-after": "1" },
    ),
  ).rejects.toMatchObject({
    status: 401,
    code: "unauthenticated",
    retryable: false,
    retryAfterMs: undefined,
    authentication: "unauthenticated",
  })
})
