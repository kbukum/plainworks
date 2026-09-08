import { describe, expect, it } from "vitest"
import { createQueryClient } from "./query-client"

describe("createQueryClient", () => {
  it("returns a fresh client each call (never a shared singleton)", () => {
    const a = createQueryClient()
    const b = createQueryClient()
    expect(a).not.toBe(b)
  })

  it("applies supplied defaults to the client", () => {
    const client = createQueryClient({ defaultOptions: { queries: { staleTime: 1234 } } })
    expect(client.getDefaultOptions().queries?.staleTime).toBe(1234)
  })
})
