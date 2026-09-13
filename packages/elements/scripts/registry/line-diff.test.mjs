import { describe, expect, it } from "vitest"
import { diffLines } from "./line-diff.mjs"

describe("unified line diff", () => {
  it("returns an empty body for identical texts", () => {
    expect(diffLines("a\nb\n", "a\nb\n")).toBe("")
  })

  it("renders one hunk with context around a single change", () => {
    const before = ["one", "two", "three", "four", "five"].join("\n")
    const after = ["one", "two", "THREE", "four", "five"].join("\n")
    expect(diffLines(before, after)).toBe(
      ["@@ -1,5 +1,5 @@", " one", " two", "-three", "+THREE", " four", " five"].join("\n"),
    )
  })

  it("splits distant changes into separate hunks with correct line numbers", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`)
    const before = lines.join("\n")
    const after = lines.map((l) => (l === "line2" || l === "line19" ? l.toUpperCase() : l)).join("\n")
    const out = diffLines(before, after, 1)
    expect(out).toContain("@@ -1,3 +1,3 @@")
    expect(out).toContain("-line2")
    expect(out).toContain("+LINE2")
    expect(out).toContain("@@ -18,3 +18,3 @@")
    expect(out).toContain("-line19")
    expect(out).toContain("+LINE19")
  })

  it("renders pure insertions and deletions", () => {
    expect(diffLines("a\nc\n", "a\nb\nc\n", 0)).toBe("@@ -1,0 +2,1 @@\n+b")
    expect(diffLines("a\nb\nc\n", "a\nc\n", 0)).toBe("@@ -2,1 +1,0 @@\n-b")
  })
})
