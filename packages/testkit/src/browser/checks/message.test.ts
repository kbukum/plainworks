import { describe, expect, it } from "vitest"
import { boundMessage } from "./message"

describe("boundMessage", () => {
  it("keeps a message within the cap as it is", () => {
    expect(boundMessage("short", 10)).toBe("short")
  })

  it("cuts a longer message at the cap and says so", () => {
    expect(boundMessage("abcdefghij", 4)).toBe("abcd…(cut at 4 chars)")
  })
})
