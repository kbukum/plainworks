import { expect, test } from "vitest"
import { HttpError } from "../error"
import { buildUrl } from "./build"

/** Capture the value a builder throws, failing the test if it unexpectedly succeeds. */
function captureError(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  return expect.unreachable("expected buildUrl to throw")
}

test("resolves a path against a base without a trailing slash", () => {
  expect(buildUrl({ baseUrl: "https://api.test/v1", path: "users" })).toBe(
    "https://api.test/v1/users",
  )
})

test("anchors a leading-slash path under the base path segment", () => {
  expect(buildUrl({ baseUrl: "https://api.test/v1", path: "/users/1" })).toBe(
    "https://api.test/v1/users/1",
  )
})

test("accepts a full absolute URL when no base is given", () => {
  expect(buildUrl({ path: "https://api.test/health" })).toBe("https://api.test/health")
})

test("encodes typed query parameters, repeating arrays and skipping null/undefined", () => {
  const url = buildUrl({
    baseUrl: "https://api.test",
    path: "search",
    query: { q: "a b", page: 2, active: true, tag: ["x", "y"], skip: null, gone: undefined },
  })
  const parsed = new URL(url)
  expect(parsed.searchParams.get("q")).toBe("a b")
  expect(parsed.searchParams.get("page")).toBe("2")
  expect(parsed.searchParams.get("active")).toBe("true")
  expect(parsed.searchParams.getAll("tag")).toEqual(["x", "y"])
  expect(parsed.searchParams.has("skip")).toBe(false)
  expect(parsed.searchParams.has("gone")).toBe(false)
})

test("refuses a credential-shaped query parameter", () => {
  expect(() =>
    buildUrl({ baseUrl: "https://api.test", path: "x", query: { access_token: "s" } }),
  ).toThrow(HttpError)
  const error = captureError(() =>
    buildUrl({ baseUrl: "https://api.test", path: "x", query: { "X-Api-Key": "s" } }),
  )
  expect(error).toBeInstanceOf(HttpError)
  expect((error as HttpError).kind).toBe("http/unsafe-url")
})

test("refuses a credential baked into the path's own query string", () => {
  expect(() => buildUrl({ baseUrl: "https://api.test", path: "x?token=leak" })).toThrow(
    "credential-shaped",
  )
})

test("refuses a dot-segment path that escapes the base path segment", () => {
  const error = captureError(() => buildUrl({ baseUrl: "https://api.test/v1/", path: "../admin" }))
  expect(error).toBeInstanceOf(HttpError)
  expect((error as HttpError).kind).toBe("http/unsafe-url")
  expect((error as HttpError).message).toContain("escapes the base")
})

test("refuses a protocol-relative path that escapes the base path segment", () => {
  const error = captureError(() =>
    buildUrl({ baseUrl: "https://api.test/v1/", path: "//evil.test/admin" }),
  )
  expect(error).toBeInstanceOf(HttpError)
  expect((error as HttpError).kind).toBe("http/unsafe-url")
})

test("refuses a URL that embeds credentials in its userinfo", () => {
  expect(() => buildUrl({ baseUrl: "https://user:s3cret@api.test", path: "x" })).toThrow(HttpError)
  const error = captureError(() => buildUrl({ path: "https://user:s3cret@api.test/x" }))
  expect(error).toBeInstanceOf(HttpError)
  expect((error as HttpError).kind).toBe("http/unsafe-url")
  // The secret must never be echoed into the error message.
  expect((error as HttpError).message).not.toContain("s3cret")
})

test("wraps an unresolvable base/path in a fatal unsafe-url error without echoing the input", () => {
  const error = captureError(() => buildUrl({ path: "http://user:s3cret@:not-a-url" }))
  expect(error).toBeInstanceOf(HttpError)
  expect((error as HttpError).kind).toBe("http/unsafe-url")
  expect((error as HttpError).message).not.toContain("s3cret")
  expect((error as HttpError).message).not.toContain("not-a-url")
})

test("does not attach the raw parser error as cause when the input is invalid", () => {
  const error = captureError(() => buildUrl({ path: "http://ex ample.test/ bad" })) as HttpError
  expect(error).toBeInstanceOf(HttpError)
  expect(error.kind).toBe("http/unsafe-url")
  // The platform TypeError echoes the input verbatim; keeping it as cause would leak that string.
  expect(error.cause).toBeUndefined()
})
