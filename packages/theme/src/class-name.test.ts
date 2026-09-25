import { describe, expect, it } from "vitest"
import { cn } from "./class-name"

describe("cn", () => {
  it("joins conditional class values", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c")
  })

  it("lets a later Tailwind utility win the merge", () => {
    expect(cn("px-2 text-sm", "px-4")).toBe("text-sm px-4")
  })

  it("keeps a type step next to a text color, and lets a later step win", () => {
    expect(cn("text-heading text-primary")).toBe("text-heading text-primary")
    expect(cn("text-body", "text-heading")).toBe("text-heading")
  })

  it("merges every token utility with its Tailwind group", () => {
    expect(cn("h-control", "h-8")).toBe("h-8")
    expect(cn("p-2", "p-inset")).toBe("p-inset")
    expect(cn("gap-stack", "gap-section")).toBe("gap-section")
    expect(cn("shadow-sm", "shadow-overlay")).toBe("shadow-overlay")
    expect(cn("z-50", "z-overlay", "z-toast")).toBe("z-toast")
    expect(cn("duration-150", "duration-fast")).toBe("duration-fast")
    expect(cn("ease-in", "ease-enter")).toBe("ease-enter")
  })
})
