import { decodeResponseFailure } from "@plainworks/http"
import { expect, test } from "vitest"
import { AuthError } from "../../errors"
import { authFailureResponse } from "./failure"
import { createRequestJar } from "./jar"

test("server failures use the shared vocabulary and never serialize causes", async () => {
  for (const [cause, status, reason] of [
    [new AuthError("auth/session-invalid", "private identity"), 401, "SESSION_INVALID"],
    [new AuthError("auth/csrf", "private proof"), 403, "CSRF_INVALID"],
    [new Error("private provider credential"), 503, "AUTH_STORE_UNAVAILABLE"],
  ]) {
    const response = authFailureResponse(cause)
    expect(response.status).toBe(status)
    expect(await response.clone().text()).not.toContain("private")
    const failure = await decodeResponseFailure(response, new AbortController().signal, 0)
    expect(failure.reason).toBe(reason)
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
