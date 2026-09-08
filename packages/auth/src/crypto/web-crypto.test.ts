import { describe, expect, test, vi } from "vitest"
import { AuthError } from "../errors"
import { defaultAuthCrypto } from "./web-crypto"

describe("defaultAuthCrypto", () => {
  test("digestSha256 produces the raw 32-byte SHA-256 of the input", async () => {
    const crypto = defaultAuthCrypto()
    // Known-answer: SHA-256("abc") =
    // ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad.
    const digest = await crypto.digestSha256(Uint8Array.of(0x61, 0x62, 0x63))
    const hex = Array.from(digest)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
    expect(digest).toBeInstanceOf(Uint8Array)
    expect(digest.length).toBe(32)
    expect(hex).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  })

  test("randomBytes fills the requested length from the host CSPRNG, not a seeded RNG", () => {
    const crypto = defaultAuthCrypto()
    const hostCrypto = (globalThis as unknown as { crypto: { getRandomValues<T>(array: T): T } })
      .crypto
    const spy = vi.spyOn(hostCrypto, "getRandomValues")

    const bytes = crypto.randomBytes(16)

    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBe(16)
    // The randomness comes only from Web Crypto's getRandomValues — the CSPRNG path.
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]?.[0]).toBe(bytes)
    spy.mockRestore()
  })

  test("two randomBytes calls do not repeat (non-deterministic, unlike the std seeded RNG)", () => {
    const crypto = defaultAuthCrypto()
    const a = crypto.randomBytes(32)
    const b = crypto.randomBytes(32)
    expect(a).not.toEqual(b)
  })

  test("hmacSha256 produces the RFC 4231 known-answer tag", async () => {
    const crypto = defaultAuthCrypto()
    // RFC 4231 test case 1: key = 20 bytes of 0x0b, data = "Hi There".
    const key = new Uint8Array(20).fill(0x0b)
    const data = Uint8Array.of(0x48, 0x69, 0x20, 0x54, 0x68, 0x65, 0x72, 0x65) // "Hi There"
    const tag = await crypto.hmacSha256(key, data)
    const hex = Array.from(tag)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
    expect(tag.length).toBe(32)
    expect(hex).toBe("b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7")
  })

  test("throws a typed auth/crypto-unavailable error when the host has no Web Crypto", async () => {
    const crypto = defaultAuthCrypto()
    vi.stubGlobal("crypto", undefined)
    try {
      expect(() => crypto.randomBytes(8)).toThrowError(AuthError)
      expect(() => crypto.randomBytes(8)).toThrow(/unavailable/)
      await expect(crypto.digestSha256(new Uint8Array([1]))).rejects.toBeInstanceOf(AuthError)
      await expect(
        crypto.hmacSha256(new Uint8Array(32), new Uint8Array([1])),
      ).rejects.toBeInstanceOf(AuthError)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test("resolves crypto lazily — importing/creating never touches the host global", () => {
    // No crypto present at construction time; a later call still works once the host provides it.
    vi.stubGlobal("crypto", undefined)
    const crypto = defaultAuthCrypto()
    vi.unstubAllGlobals()
    expect(() => crypto.randomBytes(4)).not.toThrow()
  })
})
