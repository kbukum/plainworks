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
