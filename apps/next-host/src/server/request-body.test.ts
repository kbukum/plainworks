import { describe, expect, it } from "vitest"
import { boundedRequest, PayloadTooLargeError, readBoundedText } from "./request-body"

// The bounded readers cap an attacker-controlled body before buffering: an oversized payload is
// rejected with `PayloadTooLargeError` (the route maps it to 413) rather than draining unbounded
// memory ahead of any auth or CSRF check.

function postRequest(body: string): Request {
  return new Request("http://next-host.test/logout", { method: "POST", body })
}

describe("readBoundedText", () => {
  it("returns the full body when under the cap", async () => {
    expect(await readBoundedText(postRequest("csrf=token"), 64)).toBe("csrf=token")
  })

  it("throws PayloadTooLargeError past the cap", async () => {
    await expect(readBoundedText(postRequest("x".repeat(128)), 16)).rejects.toBeInstanceOf(
      PayloadTooLargeError,
    )
  })
})

describe("boundedRequest", () => {
  it("passes a GET through untouched", async () => {
    const request = new Request("http://next-host.test/api/tasks")
    expect(await boundedRequest(request, 16)).toBe(request)
  })

  it("rebuilds a bounded request whose body a handler can still read", async () => {
    const bounded = await boundedRequest(postRequest('{"title":"x"}'), 1024)
    expect(bounded.method).toBe("POST")
    expect(await bounded.json()).toEqual({ title: "x" })
  })

  it("throws PayloadTooLargeError when the body overruns the cap", async () => {
    await expect(boundedRequest(postRequest("x".repeat(4096)), 1024)).rejects.toBeInstanceOf(
      PayloadTooLargeError,
    )
  })

  it("carries the caller's abort signal onto the rebuilt request", async () => {
    const controller = new AbortController()
    const request = new Request("http://next-host.test/api/tasks", {
      method: "POST",
      body: '{"title":"x"}',
      signal: controller.signal,
    })
    const bounded = await boundedRequest(request, 1024)
    expect(bounded.signal.aborted).toBe(false)
    controller.abort()
    expect(bounded.signal.aborted).toBe(true)
  })
})
