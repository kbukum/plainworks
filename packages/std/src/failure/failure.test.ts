import { describe, expect, test } from "vitest"
import { decodeFailure, FailureDecodeError, RemoteFailure } from "./failure"

describe("remote failure vocabulary", () => {
  test("converts wire seconds and retains field and request violations", () => {
    expect(
      decodeFailure({
        code: "INVALID_INPUT",
        message: "Invalid request",
        retryable: true,
        retryAfter: 1.25,
        reason: "FORM_INVALID",
        traceId: "trace",
        violations: [
          { field: "items[0].name", reason: "REQUIRED", message: "Required" },
          { field: "", reason: "INVALID_VALUE", message: "Dates disagree" },
        ],
      }),
    ).toEqual({
      code: "INVALID_INPUT",
      message: "Invalid request",
      retryable: true,
      retryAfterMs: 1250,
      reason: "FORM_INVALID",
      traceId: "trace",
      violations: [
        { field: "items[0].name", reason: "REQUIRED", message: "Required" },
        { field: "", reason: "INVALID_VALUE", message: "Dates disagree" },
      ],
    })
  })

  test.each([null, {}, { code: "INVALID_INPUT", message: "x", retryable: "false" }])(
    "rejects malformed failures",
    (value) => {
      expect(() => decodeFailure(value)).toThrow(FailureDecodeError)
    },
  )

  test("explicit false discards a delay without turning transient", () => {
    expect(
      decodeFailure({
        code: "SERVICE_UNAVAILABLE",
        message: "Unavailable",
        retryable: false,
        retryAfter: 60,
      }),
    ).toMatchObject({ retryable: false, retryAfterMs: undefined })
  })

  test("remote failures keep causes and classify terminal authentication", () => {
    const cause = new Error("wire")
    const failure = new RemoteFailure(
      "test",
      { code: "UNAUTHORIZED", message: "Sign in", retryable: false, violations: [] },
      { cause },
    )
    expect(failure.cause).toBe(cause)
    expect(failure.authentication).toBe("unauthenticated")
  })
})
