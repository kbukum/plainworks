import { expect, test } from "vitest"
import { classifyError, classifyStatus, isRetryable, NetworkError, StatusError } from "./classify"
import { RetryError } from "./retry"

test("401/403 are auth failures and fatal", () => {
  expect(classifyStatus(401)).toEqual({ category: "auth", disposition: "fatal" })
  expect(classifyStatus(403)).toEqual({ category: "auth", disposition: "fatal" })
})

test("408, 429, and 5xx are retryable", () => {
  expect(classifyStatus(408).disposition).toBe("retryable")
  expect(classifyStatus(429).disposition).toBe("retryable")
  expect(classifyStatus(500).disposition).toBe("retryable")
  expect(classifyStatus(503).disposition).toBe("retryable")
})

test("other 4xx are fatal protocol failures", () => {
  expect(classifyStatus(400)).toEqual({ category: "protocol", disposition: "fatal" })
  expect(classifyStatus(404).disposition).toBe("fatal")
})

test("out-of-range statuses are not treated as retryable 5xx", () => {
  expect(classifyStatus(600).disposition).toBe("fatal")
  expect(classifyStatus(999).disposition).toBe("fatal")
  expect(classifyStatus(Number.POSITIVE_INFINITY).disposition).toBe("fatal")
})

test("a non-integer status is a fatal protocol fault, not a retryable 5xx", () => {
  expect(classifyStatus(500.5)).toEqual({ category: "protocol", disposition: "fatal" })
  expect(classifyStatus(429.1).disposition).toBe("fatal")
  expect(classifyStatus(Number.NaN).disposition).toBe("fatal")
  expect(isRetryable(new StatusError(500.5))).toBe(false)
})

test("a StatusError is classified from its status", () => {
  expect(classifyError(new StatusError(503))).toEqual({
    category: "transport",
    disposition: "retryable",
  })
  expect(classifyError(new StatusError(401))).toEqual({ category: "auth", disposition: "fatal" })
})

test("a timeout error is retryable, an abort is fatal", () => {
  const timeout = new Error("late")
  timeout.name = "TimeoutError"
  const abort = new Error("cancelled")
  abort.name = "AbortError"
  expect(classifyError(timeout).disposition).toBe("retryable")
  expect(classifyError(abort).disposition).toBe("fatal")
})

test("a transport NetworkError is a retryable network failure", () => {
  expect(classifyError(new NetworkError())).toEqual({
    category: "network",
    disposition: "retryable",
  })
})

test("a raw TypeError is a programmer fault and stays fatal", () => {
  expect(classifyError(new TypeError("Cannot read properties of undefined"))).toEqual({
    category: "transport",
    disposition: "fatal",
  })
})

test("a retry-exhausted wrapper inherits the disposition of its cause", () => {
  expect(classifyError(new RetryError(3, { cause: new NetworkError() }))).toEqual({
    category: "network",
    disposition: "retryable",
  })
  expect(isRetryable(new RetryError(3, { cause: new NetworkError() }))).toBe(true)
  expect(isRetryable(new RetryError(3, { cause: new StatusError(401) }))).toBe(false)
})

test("an unknown failure is fatal by default", () => {
  expect(isRetryable(new Error("mystery"))).toBe(false)
  expect(isRetryable("just a string")).toBe(false)
})
