import { decodeProblem } from "@plainworks/std/failure"
import type { WebResponse } from "@plainworks/std/web"
import { expect, test } from "vitest"
import { decodeResponseFailure } from "./response"

/** A rejection response whose unread body cancels through the injected `cancel`. */
function failureResponse(
  status: number,
  cancel: () => Promise<void>,
  headers: Record<string, string> = {},
): WebResponse {
  return {
    status,
    headers: new Headers(headers),
    body: { cancel },
  } as unknown as WebResponse
}

test("returns the HTTP failure without waiting for the body's async cleanup", async () => {
  let cancelled = false
  // A source whose cleanup never resolves must not block (or outrun the deadline on) the already
  // known HTTP outcome — a terminal 401 must stay a 401, not degrade into a timeout.
  const response = failureResponse(401, () => {
    cancelled = true
    return new Promise<void>(() => {})
  })

  const error = await decodeResponseFailure(response, new AbortController().signal, 0)

  expect(error).toMatchObject({ kind: "http/status", status: 401 })
  expect(error.cause).toBe(response)
  expect(cancelled).toBe(true)
})

test("preserves the retry-after hint and ignores a cleanup rejection", async () => {
  const response = failureResponse(429, () => Promise.reject(new Error("cleanup failed")), {
    "retry-after": "2",
  })

  const error = await decodeResponseFailure(response, new AbortController().signal, 1_000)

  expect(error).toMatchObject({ status: 429, retryAfterMs: 2_000 })
  expect(error.cause).toBe(response)
})

function problemResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/problem+json", ...headers },
  })
}

test.each([
  { status: 401, code: "unauthenticated", retryable: false, authentication: "unauthenticated" },
  { status: 503, code: "unavailable", retryable: true, authentication: undefined },
])("a problem without type keeps the HTTP $status classification", async (expected) => {
  const error = await decodeResponseFailure(
    problemResponse(expected.status, { title: "Request failed", status: expected.status }),
    new AbortController().signal,
    0,
  )
  expect(error).toMatchObject({ kind: "http/status", message: "Request failed", ...expected })
})

test("a typed problem keeps its type as the reason and honors Retry-After", async () => {
  const error = await decodeResponseFailure(
    problemResponse(
      503,
      { type: "https://example.test/maintenance", detail: "Back soon.", window: "10m" },
      { "retry-after": "3" },
    ),
    new AbortController().signal,
    0,
  )
  expect(error).toMatchObject({
    status: 503,
    code: "unavailable",
    message: "Back soon.",
    reason: "https://example.test/maintenance",
    metadata: { window: "10m" },
    retryAfterMs: 3_000,
  })
})

test.each([null, 42, {}])("an invalid problem type is operational: %j", async (type) => {
  const error = await decodeResponseFailure(
    problemResponse(401, { type, status: 401 }),
    new AbortController().signal,
    0,
  )
  expect(error).toMatchObject({
    kind: "http/decode",
    code: "internal",
    status: undefined,
    retryable: false,
  })
})

test("an injected decoder reads the server's extension members", async () => {
  const error = await decodeResponseFailure(
    problemResponse(409, { title: "Conflict", reason: "LOCKED" }),
    new AbortController().signal,
    0,
    (input) => ({ ...decodeProblem(input), code: "failed_precondition", reason: "LOCKED" }),
  )
  expect(error).toMatchObject({ status: 409, code: "failed_precondition", reason: "LOCKED" })
})
