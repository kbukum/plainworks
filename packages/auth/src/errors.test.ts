import { describe, expect, test } from "vitest"
import { AuthError, isAuthErrorKind } from "./errors"

describe("isAuthErrorKind", () => {
  test("matches an AuthError of the given kind", () => {
    const error = new AuthError("auth/login-transaction", "no transaction")
    expect(isAuthErrorKind(error, "auth/login-transaction")).toBe(true)
    expect(isAuthErrorKind(error, "auth/adapter")).toBe(false)
  })

  test("matches by kind across module copies, where the class identity differs", () => {
    // A bundler can load the package twice (one copy per server route), so instanceof fails.
    class ForeignAuthError extends Error {
      readonly kind = "auth/login-transaction"
    }
    expect(isAuthErrorKind(new ForeignAuthError("copy"), "auth/login-transaction")).toBe(true)
  })

  test("rejects values that are not errors", () => {
    expect(isAuthErrorKind({ kind: "auth/login-transaction" }, "auth/login-transaction")).toBe(
      false,
    )
    expect(isAuthErrorKind("auth/login-transaction", "auth/login-transaction")).toBe(false)
    expect(isAuthErrorKind(undefined, "auth/login-transaction")).toBe(false)
  })
})
