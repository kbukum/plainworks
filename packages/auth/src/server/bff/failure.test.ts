import { decodeResponseFailure } from "@plainworks/http"
import { expect, test } from "vitest"
import { AuthError } from "../../errors"
import { sessionFailures } from "../../session/failures"
import { authFailureResponse } from "./failure"
import { createRequestJar } from "./jar"

test("server failures are standard problems and never serialize causes", async () => {
  for (const [cause, status, reason, authentication] of [
    [
      new AuthError("auth/session-invalid", "private identity"),
      401,
      "SESSION_INVALID",
      "unauthenticated",
    ],
    [new AuthError("auth/csrf", "private proof"), 403, "CSRF_INVALID", undefined],
    [new Error("private provider credential"), 503, "AUTH_STORE_UNAVAILABLE", "unavailable"],
  ] as const) {
    const response = authFailureResponse(cause)
    expect(response.status).toBe(status)
    expect(await response.clone().text()).not.toContain("private")
    const standard = await decodeResponseFailure(response.clone(), new AbortController().signal, 0)
    expect(standard).toMatchObject({ status, reason: undefined, metadata: { reason } })
    const failure = await decodeResponseFailure(
      response,
      new AbortController().signal,
      0,
      sessionFailures,
    )
    expect(failure).toMatchObject({ status, reason, authentication, retryable: false })
  }
})

test("duplicate and unsupported browser credentials fail before cookie lookup", () => {
  for (const headers of [
    new Headers({ cookie: "__Host-session=one; __Host-session=two" }),
    new Headers({ authorization: "unsupported" }),
    new Headers({ "x-api-key": "unsupported" }),
  ])
    expect(() => createRequestJar({ headers })).toThrow()
})
