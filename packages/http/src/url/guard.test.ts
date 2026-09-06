import { expect, test } from "vitest"
import { HttpError } from "../error"
import { assertSafeRequestUrl } from "./build"

test("accepts a clean absolute URL", () => {
  expect(() => assertSafeRequestUrl("https://api.test/v1/widgets?page=2")).not.toThrow()
})

test("rejects a final URL that embeds userinfo credentials", () => {
  const error = captureError(() => assertSafeRequestUrl("https://user:pass@api.test/x"))
  expect(error).toBeInstanceOf(HttpError)
  expect((error as HttpError).kind).toBe("http/unsafe-url")
})

test("rejects a final URL carrying a credential-shaped query parameter", () => {
  const error = captureError(() => assertSafeRequestUrl("https://api.test/x?access_token=leak"))
  expect(error).toBeInstanceOf(HttpError)
  expect((error as HttpError).kind).toBe("http/unsafe-url")
  // Neither the key nor the value is echoed into the message.
  expect((error as HttpError).message).not.toContain("access_token")
  expect((error as HttpError).message).not.toContain("leak")
})

test("rejects a final URL that no longer parses", () => {
  const error = captureError(() => assertSafeRequestUrl("::::not a url"))
  expect(error).toBeInstanceOf(HttpError)
  expect((error as HttpError).kind).toBe("http/unsafe-url")
})

/** Capture the value a guard throws, failing the test if it unexpectedly succeeds. */
function captureError(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  return expect.unreachable("expected assertSafeRequestUrl to throw")
}
