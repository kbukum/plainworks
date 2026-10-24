import { describe, expect, test } from "vitest"
import { classifyStatus } from "../resilience"
import {
  failureCodeForStatus,
  failureCodes,
  httpStatusFor,
  isFailureCode,
  isRetryableStatus,
} from "./codes"
import { FailureDecodeError, RemoteFailure } from "./failure"
import { decodeProblem } from "./problem"

describe("canonical codes", () => {
  test("round-trip every unambiguous HTTP status", () => {
    for (const code of failureCodes) {
      const status = httpStatusFor(code)
      expect(isFailureCode(code)).toBe(true)
      expect(httpStatusFor(failureCodeForStatus(status))).toBe(status)
    }
    expect(isFailureCode("NOT_FOUND")).toBe(false)
  })

  test.each([
    [422, "invalid_argument"],
    [408, "deadline_exceeded"],
    [418, "failed_precondition"],
    [502, "unavailable"],
    [507, "internal"],
    [302, "unknown"],
  ] as const)("maps HTTP %i to %s", (status, code) => {
    expect(failureCodeForStatus(status)).toBe(code)
  })
})

describe("HTTP retry verdict", () => {
  test.each([
    [408, true],
    [429, true],
    [500, true],
    [501, true],
    [503, true],
    [599, true],
    [400, false],
    [401, false],
    [404, false],
    [600, false],
    [500.5, false],
  ] as const)("HTTP %d retryable is %s", (status, retryable) => {
    expect(isRetryableStatus(status)).toBe(retryable)
  })

  test("the problem decoder and the resilience classifier give one verdict for every status", () => {
    for (let status = 400; status < 600; status++) {
      const decoded = decodeProblem({ status, body: {} }).retryable
      const classified = classifyStatus(status).disposition === "retryable"
      expect([status, decoded]).toEqual([status, classified])
    }
  })
})

describe("remote failure", () => {
  test("keeps causes and ends the session for unauthenticated", () => {
    const cause = new Error("wire")
    const failure = new RemoteFailure(
      "test",
      { code: "unauthenticated", message: "Sign in", retryable: true, violations: [] },
      { cause },
    )
    expect(failure).toMatchObject({ authentication: "unauthenticated", retryable: false })
    expect(failure.cause).toBe(cause)
    expect(failure.metadata).toEqual({})
  })

  test("a decoder may report an unavailable session check", () => {
    const failure = new RemoteFailure("test", {
      code: "unavailable",
      message: "Down",
      retryable: true,
      retryAfterMs: 50,
      authentication: "unavailable",
      violations: [],
    })
    expect(failure).toMatchObject({ retryable: false, retryAfterMs: undefined })
  })
})

describe("RFC 9457 problems", () => {
  test("reads the standard members and string extensions", () => {
    expect(
      decodeProblem({
        status: 503,
        retryAfterMs: 2000,
        body: {
          type: "https://example.test/problems/maintenance",
          title: "Maintenance",
          status: 503,
          detail: "Back soon.",
          instance: "/jobs/1",
          window: "10m",
          attempts: 3,
        },
      }),
    ).toEqual({
      code: "unavailable",
      message: "Back soon.",
      reason: "https://example.test/problems/maintenance",
      metadata: { window: "10m" },
      violations: [],
      retryable: true,
      retryAfterMs: 2000,
    })
  })

  test("about:blank has no reason and falls back to the title", () => {
    expect(
      decodeProblem({ status: 404, retryAfterMs: 10, body: { title: "Not Found" } }),
    ).toMatchObject({
      code: "not_found",
      message: "Not Found",
      reason: undefined,
      retryable: false,
      retryAfterMs: undefined,
    })
  })

  test.each([null, [], { status: 500 }, { type: 1 }, { detail: 2 }, { title: false }])(
    "rejects a malformed problem %j",
    (body) => {
      expect(() => decodeProblem({ status: 404, body })).toThrow(FailureDecodeError)
    },
  )
})
