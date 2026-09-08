import { createSeededRandom } from "@plainworks/std"
import { describe, expect, test } from "vitest"
import type { AuthCrypto } from "../crypto"
import { defaultAuthCrypto } from "../crypto"
import { mintCsrfToken, verifyCsrfToken } from "./token"

describe("mintCsrfToken", () => {
  test("returns a URL-safe token derived from CSPRNG bytes", () => {
    const token = mintCsrfToken(defaultAuthCrypto())
    // 32 bytes -> ceil(32*8/6) = 43 base64url chars, no padding or unsafe characters.
    expect(token).toHaveLength(43)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  test("draws from the injected crypto for its length", () => {
    let requested = -1
    const crypto: AuthCrypto = {
      ...defaultAuthCrypto(),
      randomBytes: (length) => {
        requested = length
        return new Uint8Array(length)
      },
    }
    mintCsrfToken(crypto, 16)
    expect(requested).toBe(16)
  })

  test("two mints do not collide", () => {
    const crypto = defaultAuthCrypto()
    expect(mintCsrfToken(crypto)).not.toBe(mintCsrfToken(crypto))
  })
})

describe("verifyCsrfToken", () => {
  test("accepts an exact match", () => {
    const token = mintCsrfToken(defaultAuthCrypto())
    expect(verifyCsrfToken(token, token)).toBe(true)
  })

  test("rejects a mismatch and an empty token on either side", () => {
    expect(verifyCsrfToken("aaaa", "aaab")).toBe(false)
    expect(verifyCsrfToken("", "aaaa")).toBe(false)
    expect(verifyCsrfToken("aaaa", "")).toBe(false)
    expect(verifyCsrfToken("", "")).toBe(false)
  })

  test("rejects a token that is a prefix of the other (length-sensitive)", () => {
    expect(verifyCsrfToken("aaaa", "aaaaa")).toBe(false)
  })

  test("fuzz: a fresh token never verifies against a different fresh token", () => {
    const crypto = defaultAuthCrypto()
    const rng = createSeededRandom(0xc57f)
    for (let iteration = 0; iteration < 200; iteration++) {
      const a = mintCsrfToken(crypto, 8 + Math.floor(rng.next() * 24))
      const b = mintCsrfToken(crypto, 8 + Math.floor(rng.next() * 24))
      expect(verifyCsrfToken(a, b)).toBe(false)
      expect(verifyCsrfToken(a, a)).toBe(true)
    }
  })
})
