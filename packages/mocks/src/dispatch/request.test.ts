import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import { dispatchMockRequest } from "./request"

describe("dispatchMockRequest", () => {
  it("returns the first matching handler response", async () => {
    const response = await dispatchMockRequest(new Request("https://plainworks.test/tasks"), [
      http.get("*/tasks", () => HttpResponse.json({ data: ["matched"] })),
      http.get("*/tasks", () => HttpResponse.json({ data: ["later"] })),
    ])

    expect(response?.status).toBe(200)
    await expect(response?.json()).resolves.toEqual({ data: ["matched"] })
  })

  it("returns undefined when no handler matches", async () => {
    const response = await dispatchMockRequest(new Request("https://plainworks.test/unknown"), [
      http.get("*/tasks", () => HttpResponse.json({ data: [] })),
    ])

    expect(response).toBeUndefined()
  })
})

describe("dispatchMockRequest body cap", () => {
  const echo = http.post("*/tasks", async ({ request }) =>
    HttpResponse.json({ received: await request.text() }),
  )

  function post(body: string, signal?: AbortSignal): Request {
    return new Request("https://plainworks.test/tasks", {
      method: "POST",
      body,
      ...(signal === undefined ? {} : { signal }),
    })
  }

  it("hands a handler the buffered body when under the cap", async () => {
    const response = await dispatchMockRequest(post("hello"), [echo], { maxBodyBytes: 16 })
    await expect(response?.json()).resolves.toEqual({ received: "hello" })
  })

  it("answers 413 without running a handler when the body passes the cap", async () => {
    let ran = false
    const spy = http.post("*/tasks", () => {
      ran = true
      return HttpResponse.json({})
    })
    const response = await dispatchMockRequest(post("x".repeat(32)), [spy], { maxBodyBytes: 16 })
    expect(response?.status).toBe(413)
    await expect(response?.json()).resolves.toEqual({ error: "Request body too large" })
    expect(ran).toBe(false)
  })

  it("caps bodies at 1 MiB by default", async () => {
    const response = await dispatchMockRequest(post("x".repeat(1024 * 1024 + 1)), [echo])
    expect(response?.status).toBe(413)
  })

  it("keeps the caller's abort signal on the buffered request", async () => {
    const controller = new AbortController()
    let seen: AbortSignal | undefined
    const capture = http.post("*/tasks", ({ request }) => {
      seen = request.signal
      return HttpResponse.json({})
    })
    await dispatchMockRequest(post("x", controller.signal), [capture])
    controller.abort()
    expect(seen?.aborted).toBe(true)
  })

  it("rejects an invalid cap", async () => {
    await expect(dispatchMockRequest(post("x"), [echo], { maxBodyBytes: 0 })).rejects.toThrow(
      RangeError,
    )
  })
})
