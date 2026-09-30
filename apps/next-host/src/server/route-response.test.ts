import type { WebResponse } from "@plainworks/std/web"
import { describe, expect, it } from "vitest"
import { routeResponse } from "./route-response"

describe("routeResponse", () => {
  it("returns a platform Response unchanged", () => {
    const response = new Response(null, { status: 303 })
    expect(routeResponse(response as unknown as WebResponse)).toBe(response)
  })

  it("rejects anything that is not a platform Response", () => {
    const fake = { status: 200 } as unknown as WebResponse
    expect(() => routeResponse(fake)).toThrow(TypeError)
  })
})
