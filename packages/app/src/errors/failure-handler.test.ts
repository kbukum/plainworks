import { RemoteFailure } from "@plainworks/std/failure"
import { expect, test, vi } from "vitest"
import { createFailureHandler } from "./failure-handler"

test("dispatches once by code, localizes by reason, and exposes terminal authentication", () => {
  const onFailure = vi.fn()
  const onUnauthenticated = vi.fn()
  const handle = createFailureHandler({
    messages: { NOT_FOUND: "Not found" },
    reasons: { USER_GONE: "This user is gone" },
    onFailure,
    onUnauthenticated,
  })
  const missing = new RemoteFailure("test", {
    code: "NOT_FOUND",
    reason: "USER_GONE",
    message: "fallback",
    retryable: false,
    violations: [],
  })
  expect(handle(missing)).toMatchObject({ kind: "failure", message: "This user is gone" })
  const auth = new RemoteFailure("test", {
    code: "UNAUTHORIZED",
    message: "Sign in",
    retryable: true,
    violations: [],
  })
  expect(handle(auth)).toMatchObject({ kind: "unauthenticated", message: "Sign in" })
  expect(onFailure).toHaveBeenCalledOnce()
  expect(onUnauthenticated).toHaveBeenCalledOnce()
})
