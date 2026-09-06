import { describe, expect, test } from "vitest"
import { ensureError, getErrorMessage, PlainError } from "./errors"

describe("PlainError", () => {
  test("carries a typed kind and message", () => {
    const error = new PlainError("std/test", "boom")
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe("PlainError")
    expect(error.kind).toBe("std/test")
    expect(error.message).toBe("boom")
  })

  test("preserves the underlying cause when provided", () => {
    const cause = new Error("root")
    const error = new PlainError("std/test", "wrapped", { cause })
    expect(error.cause).toBe(cause)
  })

  test("omits cause when none is given", () => {
    const error = new PlainError("std/test", "no cause")
    expect(error.cause).toBeUndefined()
  })

  test("a subclass reports its own constructor name, not the base name", () => {
    class HttpError extends PlainError<"http"> {
      constructor(message: string) {
        super("http", message)
      }
    }
    const error = new HttpError("bad status")
    expect(error.name).toBe("HttpError")
    expect(error.kind).toBe("http")
  })
})

describe("ensureError", () => {
  test("returns Error values unchanged", () => {
    const original = new Error("keep me")
    expect(ensureError(original)).toBe(original)
  })

  test("wraps a thrown string as the message and keeps the value as cause", () => {
    const error = ensureError("plain string")
    expect(error).toBeInstanceOf(PlainError)
    expect(error.message).toBe("plain string")
    expect(error.cause).toBe("plain string")
  })

  test("wraps a non-string, non-Error value with a generic message", () => {
    const value = { code: 42 }
    const error = ensureError(value)
    expect(error.message).toBe("Unknown error thrown")
    expect(error.cause).toBe(value)
  })
})

describe("getErrorMessage", () => {
  test("reads the message of an Error", () => {
    expect(getErrorMessage(new Error("hi"))).toBe("hi")
  })

  test("returns a string value directly", () => {
    expect(getErrorMessage("literal")).toBe("literal")
  })

  test("falls back for unknown shapes", () => {
    expect(getErrorMessage(123)).toBe("Unknown error")
  })
})
