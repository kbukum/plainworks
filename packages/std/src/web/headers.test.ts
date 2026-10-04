import { expect, test } from "vitest"
import { createHeaders } from "./headers"

test("structural initializers copy independently across host header types", () => {
  expect([...createHeaders()]).toEqual([])
  for (const initial of [
    { "x-proof": "one" },
    [["x-proof", "one"]] as const,
    new Headers({ "x-proof": "one" }),
  ]) {
    const headers = createHeaders(initial)
    expect(headers.get("x-proof")).toBe("one")
    headers.set("x-proof", "two")
    expect(createHeaders(initial).get("x-proof")).toBe("one")
  }
})
