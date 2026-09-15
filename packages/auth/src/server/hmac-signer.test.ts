import { describe, expect, test } from "vitest"
import { defaultAuthCrypto } from "../crypto"
import { AuthError } from "../errors"
import { hmacSessionSigner } from "./hmac-signer"

// Full-strength (32-byte) keys for the happy paths.
const keyA = new Uint8Array(32).fill(0x2a)
const keyB = new Uint8Array(32).fill(0x99)

describe("hmacSessionSigner configuration", () => {
  test("rejects a key shorter than 32 bytes with a typed auth/config error", () => {
    expect(() => hmacSessionSigner({ keys: [new Uint8Array(31)] })).toThrow(AuthError)
    try {
      hmacSessionSigner({ keys: [new Uint8Array(16)] })
      expect.unreachable("expected an AuthError")
    } catch (error) {
      expect(error).toMatchObject({ kind: "auth/config" })
    }
  })

  test("rejects an empty keyset with a typed auth/config error", () => {
    try {
      hmacSessionSigner({ keys: [] })
      expect.unreachable("expected an AuthError")
    } catch (error) {
      expect(error).toMatchObject({ kind: "auth/config" })
    }
  })

  test("accepts a 32-byte key", () => {
    expect(() => hmacSessionSigner({ keys: [keyA] })).not.toThrow()
  })
})

describe("hmacSessionSigner sign/verify", () => {
  test("verify accepts the signer's own signature (round-trip)", async () => {
    const signer = hmacSessionSigner({ keys: [keyA] })
    const signature = await signer.sign("session-payload")
    expect(signature).toMatch(/^[A-Za-z0-9_-]+$/)
    await expect(signer.verify("session-payload", signature)).resolves.toBe(true)
  })

  test("verify rejects a signature over a different message", async () => {
    const signer = hmacSessionSigner({ keys: [keyA] })
    const signature = await signer.sign("message-a")
    await expect(signer.verify("message-b", signature)).resolves.toBe(false)
  })

  test("verify rejects a signature minted with a key outside the set", async () => {
    const a = hmacSessionSigner({ keys: [keyA] })
    const b = hmacSessionSigner({ keys: [keyB] })
    const signature = await a.sign("payload")
    await expect(b.verify("payload", signature)).resolves.toBe(false)
  })

  test("verify returns false (never throws) for a malformed base64url signature", async () => {
    const signer = hmacSessionSigner({ keys: [keyA] })
    await expect(signer.verify("payload", "not valid base64url!")).resolves.toBe(false)
  })

  test("signs with the active (first) key", async () => {
    const active = hmacSessionSigner({ keys: [keyA] })
    // A signer whose active key is keyA produces the same tag whether or not keyB trails the set.
    const withTrailing = hmacSessionSigner({ keys: [keyA, keyB] })
    const signature = await active.sign("payload")
    expect(await withTrailing.sign("payload")).toBe(signature)
  })

  test("uses the injected crypto seam once per key on verify", async () => {
    let calls = 0
    const base = defaultAuthCrypto()
    const crypto = {
      ...base,
      hmacSha256: (key: Uint8Array, message: Uint8Array) => {
        calls++
        return base.hmacSha256(key, message)
      },
    }
    const signer = hmacSessionSigner({ keys: [keyA], crypto })
    const signature = await signer.sign("payload")
    await signer.verify("payload", signature)
    expect(calls).toBe(2)
  })
})

describe("hmacSessionSigner key rotation", () => {
  test("a cookie signed under the previous key still verifies after rotation", async () => {
    // The old active key signs a session, then a fresh key is rotated to the front with the old key
    // retained in the accepted set — the live session must still verify.
    const previous = hmacSessionSigner({ keys: [keyA] })
    const signature = await previous.sign("live-session")

    const rotated = hmacSessionSigner({ keys: [keyB, keyA] })
    await expect(rotated.verify("live-session", signature)).resolves.toBe(true)

    // New sessions are signed under the new active key.
    const fresh = await rotated.sign("live-session")
    expect(fresh).not.toBe(signature)
    await expect(rotated.verify("live-session", fresh)).resolves.toBe(true)
  })

  test("a cookie signed under a retired key no longer verifies once it leaves the set", async () => {
    const previous = hmacSessionSigner({ keys: [keyA] })
    const signature = await previous.sign("live-session")

    // keyA has been fully retired; only keyB is accepted now.
    const retired = hmacSessionSigner({ keys: [keyB] })
    await expect(retired.verify("live-session", signature)).resolves.toBe(false)
  })
})
