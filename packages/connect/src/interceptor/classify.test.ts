import { Code, ConnectError } from "@connectrpc/connect"
import { AbortError, TimeoutError } from "@plainworks/std"
import { describe, expect, test } from "vitest"
import { isConnectRetryable } from "./classify"

describe("isConnectRetryable", () => {
  test("treats unavailable and resource_exhausted ConnectErrors as retryable", () => {
    expect(isConnectRetryable(new ConnectError("down", Code.Unavailable))).toBe(true)
    expect(isConnectRetryable(new ConnectError("slow", Code.ResourceExhausted))).toBe(true)
  })

  test("treats other ConnectError codes as fatal", () => {
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
