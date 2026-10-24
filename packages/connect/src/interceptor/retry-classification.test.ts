import { Code, ConnectError } from "@connectrpc/connect"
import { AbortError, TimeoutError } from "@plainworks/std/resilience"
import { describe, expect, test } from "vitest"
import { isConnectRetryable } from "./retry-classification"

describe("isConnectRetryable", () => {
  test("treats unavailable as retryable without RetryInfo", () => {
    expect(isConnectRetryable(new ConnectError("down", Code.Unavailable))).toBe(true)
  })

  test("uses the injected decoder's verdict", () => {
    const failure = new ConnectError("down", Code.Unavailable)
    expect(
      isConnectRetryable(failure, (input) => ({ ...input, violations: [], retryable: false })),
    ).toBe(false)
  })

  test("treats other ConnectError codes as fatal without RetryInfo", () => {
    expect(isConnectRetryable(new ConnectError("slow", Code.ResourceExhausted))).toBe(false)
    expect(isConnectRetryable(new ConnectError("nope", Code.NotFound))).toBe(false)
    expect(isConnectRetryable(new ConnectError("bad", Code.InvalidArgument))).toBe(false)
    expect(isConnectRetryable(new ConnectError("stop", Code.Canceled))).toBe(false)
  })

  test("defers to the std classifier for non-Connect errors", () => {
    // A per-attempt timeout is retryable; a caller abort and an unknown throw are fatal.
    expect(isConnectRetryable(new TimeoutError(100))).toBe(true)
    expect(isConnectRetryable(new AbortError())).toBe(false)
    expect(isConnectRetryable(new Error("mystery"))).toBe(false)
  })
})
