import { PlainError } from "@plainworks/std"
import { describe, expect, it } from "vitest"
import { describeErrorSafely } from "./error-summary"

describe("describeErrorSafely", () => {
  it("masks a PlainError's caller-controlled kind and message", () => {
    const error = new PlainError("secret-kind", "connecting to secret-host.internal failed")
    expect(describeErrorSafely(error)).toBe("PlainError")
  })

  it("reports an allowlisted built-in error class, never its message payload", () => {
    expect(describeErrorSafely(new TypeError("secret-payload in message"))).toBe("TypeError")
    expect(describeErrorSafely(new Error("secret-payload in message"))).toBe("Error")
  })

  it("masks a caller-controlled error name", () => {
    const error = Object.assign(new Error("safe"), { name: "secret-payload" })
    expect(describeErrorSafely(error)).toBe("Error")
  })

  it("masks caller-controlled non-Error values", () => {
    expect(describeErrorSafely("secret-payload")).toBe("Unknown error")
    expect(describeErrorSafely({ token: "secret-payload" })).toBe("Unknown error")
  })
})
