import { describe, expect, test } from "vitest"
import { utf8ByteLength } from "./utf8"

describe("utf8 byte length", () => {
  test("counts ASCII, 2-, 3-, and 4-byte code points like TextEncoder", () => {
    const encoder = new TextEncoder()
    for (const sample of ["theme", "café", "€uro", "😀 emoji", "a\u00e9\u20ac\u{1f600}z"]) {
      expect(utf8ByteLength(sample)).toBe(encoder.encode(sample).length)
    }
  })

  test("counts a lone surrogate as the 3-byte replacement, matching TextEncoder", () => {
    const encoder = new TextEncoder()
    for (const sample of ["\ud83d", "a\ud83dz", "\udc00", "\ud83d\ud83d"]) {
      expect(utf8ByteLength(sample)).toBe(encoder.encode(sample).length)
    }
  })
})
