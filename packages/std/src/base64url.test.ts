import { describe, expect, test } from "vitest"
import { base64urlDecode, base64urlEncode } from "./base64url"
import { createSeededRandom } from "./random"

const encoder = new TextEncoder()

describe("base64urlEncode", () => {
  test("matches RFC 4648 vectors, unpadded and URL-safe", () => {
    expect(base64urlEncode(encoder.encode(""))).toBe("")
    expect(base64urlEncode(encoder.encode("f"))).toBe("Zg")
    expect(base64urlEncode(encoder.encode("fo"))).toBe("Zm8")
    expect(base64urlEncode(encoder.encode("foo"))).toBe("Zm9v")
    expect(base64urlEncode(encoder.encode("foob"))).toBe("Zm9vYg")
    expect(base64urlEncode(encoder.encode("fooba"))).toBe("Zm9vYmE")
    expect(base64urlEncode(encoder.encode("foobar"))).toBe("Zm9vYmFy")
  })

  test("emits the URL-safe alphabet (- and _), never + or /", () => {
    // 0xfb, 0xff -> "+/8" in standard base64; base64url replaces + and / with - and _.
    const encoded = base64urlEncode(Uint8Array.of(0xfb, 0xff))
    expect(encoded).toBe("-_8")
    expect(encoded).not.toMatch(/[+/=]/)
  })
})

describe("base64urlDecode", () => {
  test("inverts encode for the RFC vectors", () => {
    const decoder = new TextDecoder()
    for (const sample of ["", "f", "fo", "foo", "foob", "fooba", "foobar"]) {
      expect(decoder.decode(base64urlDecode(base64urlEncode(encoder.encode(sample))))).toBe(sample)
    }
  })

  test("rejects a character outside the alphabet", () => {
    expect(() => base64urlDecode("Zm9v!")).toThrow(RangeError)
    expect(() => base64urlDecode("Zm9v=")).toThrow(RangeError)
    expect(() => base64urlDecode("Zm9v+")).toThrow(RangeError)
  })

  test("rejects an impossible dangling group length", () => {
    expect(() => base64urlDecode("Z")).toThrow(RangeError)
    expect(() => base64urlDecode("Zm9vZ")).toThrow(RangeError)
  })
})

describe("base64url round-trip (fuzz)", () => {
  test("decode(encode(bytes)) === bytes for random byte arrays", () => {
    const rng = createSeededRandom(0x5eed)
    for (let iteration = 0; iteration < 500; iteration++) {
      const length = Math.floor(rng.next() * 64)
      const bytes = new Uint8Array(length)
      for (let index = 0; index < length; index++) {
        bytes[index] = Math.floor(rng.next() * 256)
      }
      expect([...base64urlDecode(base64urlEncode(bytes))]).toEqual([...bytes])
    }
  })
})
