import { PayloadTooLargeError } from "@plainworks/std/web"
import { describe, expect, it } from "vitest"
import { readFormBody } from "./form"

// A form body is attacker-controlled, so it is read no further than a small cap before any CSRF or
// session work runs.

function formRequest(body: string, signal = new AbortController().signal) {
  return { body: new Response(body).body, signal }
}

describe("readFormBody", () => {
  it("parses a URL-encoded body under the cap", async () => {
    const params = await readFormBody(formRequest("csrf=tok%20en&returnTo=%2Ftasks"))
    expect(params.get("csrf")).toBe("tok en")
    expect(params.get("returnTo")).toBe("/tasks")
  })

  it("reads an empty body as no fields", async () => {
    const params = await readFormBody({ body: null, signal: new AbortController().signal })
    expect(params.get("csrf")).toBeNull()
  })

  it("rejects a body past the default 16 KiB cap", async () => {
    await expect(readFormBody(formRequest("x".repeat(16 * 1024 + 1)))).rejects.toBeInstanceOf(
      PayloadTooLargeError,
    )
  })

  it("honours a smaller cap", async () => {
    await expect(
      readFormBody(formRequest("x".repeat(32)), { maxBytes: 16 }),
    ).rejects.toBeInstanceOf(PayloadTooLargeError)
  })

  it("stops when the request is aborted", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(readFormBody(formRequest("csrf=x", controller.signal))).rejects.toThrow()
  })
})
