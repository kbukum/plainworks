import { listQueryKey } from "@plainworks/query"
import { describe, expect, it } from "vitest"

// The cache-key derivation is order-independent over the AND-set of filters and distinct on any change,
// so writing the same request differently keys the same cache entry while a real difference keys a new
// one. This is the `@plainworks/query` half of the contract, exercised against the shared param shape.

describe("list cache key derivation", () => {
  it("keys equal params equally regardless of filter order and distinctly on any change", () => {
    const a = listQueryKey("users", {
      filters: [
        { field: "status", op: "eq", value: "active" },
        { field: "role", op: "eq", value: "admin" },
      ],
      pageSize: 5,
    })
    const b = listQueryKey("users", {
      filters: [
        { field: "role", op: "eq", value: "admin" },
        { field: "status", op: "eq", value: "active" },
      ],
      pageSize: 5,
    })
    const c = listQueryKey("users", {
      filters: [{ field: "status", op: "eq", value: "inactive" }],
      pageSize: 5,
    })
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })
})
