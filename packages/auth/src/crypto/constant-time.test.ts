import { describe, expect, test } from "vitest"
import { constantTimeEqual } from "./constant-time"

describe("constantTimeEqual", () => {
  test("is true for identical byte arrays", () => {
    expect(constantTimeEqual(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2, 3))).toBe(true)
    expect(constantTimeEqual(new Uint8Array(0), new Uint8Array(0))).toBe(true)
  })

  test("is false when any byte differs", () => {
    expect(constantTimeEqual(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2, 4))).toBe(false)
    expect(constantTimeEqual(Uint8Array.of(0), Uint8Array.of(0x80))).toBe(false)
  })

  test("is false for different lengths without a byte-by-byte compare", () => {
    expect(constantTimeEqual(Uint8Array.of(1, 2), Uint8Array.of(1, 2, 3))).toBe(false)
    expect(constantTimeEqual(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2))).toBe(false)
  })
})
