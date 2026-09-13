import { describe, expect, it } from "vitest"
import { cn } from "./class-name"

describe("cn", () => {
  it("joins conditional class values", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c")
  })

  it("lets a later Tailwind utility win the merge", () => {
    expect(cn("px-2 text-sm", "px-4")).toBe("text-sm px-4")
  })
})
