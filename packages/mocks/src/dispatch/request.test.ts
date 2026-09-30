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
