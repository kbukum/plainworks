import { describe, expect, test } from "vitest"
import { defaultAuthCrypto } from "../crypto"
import { AuthError } from "../errors"
import { hmacSessionSigner } from "./hmac-signer"

// A full-strength (32-byte) secret for the happy paths.
const secret = new Uint8Array(32).fill(0x2a)

describe("hmacSessionSigner configuration", () => {
  test("rejects a secret shorter than 32 bytes with a typed auth/config error", () => {
    expect(() => hmacSessionSigner({ secret: new Uint8Array(31) })).toThrow(AuthError)
    try {
      hmacSessionSigner({ secret: new Uint8Array(16) })
      expect.unreachable("expected an AuthError")
    } catch (error) {
      expect(error).toMatchObject({ kind: "auth/config" })
    }
  })

  test("accepts a 32-byte secret", () => {
    expect(() => hmacSessionSigner({ secret })).not.toThrow()
  })
})

describe("hmacSessionSigner sign/verify", () => {
  test("verify accepts the signer's own signature (round-trip)", async () => {
    const signer = hmacSessionSigner({ secret })
    const signature = await signer.sign("session-payload")
    expect(signature).toMatch(/^[A-Za-z0-9_-]+$/)
    await expect(signer.verify("session-payload", signature)).resolves.toBe(true)
  })

  test("verify rejects a signature over a different message", async () => {
    const signer = hmacSessionSigner({ secret })
    const signature = await signer.sign("message-a")
    await expect(signer.verify("message-b", signature)).resolves.toBe(false)
  })

  test("verify rejects a signature minted with a different secret", async () => {
    const a = hmacSessionSigner({ secret })
    const b = hmacSessionSigner({ secret: new Uint8Array(32).fill(0x99) })
    const signature = await a.sign("payload")
    await expect(b.verify("payload", signature)).resolves.toBe(false)
  })

  test("verify returns false (never throws) for a malformed base64url signature", async () => {
    const signer = hmacSessionSigner({ secret })
    await expect(signer.verify("payload", "not valid base64url!")).resolves.toBe(false)
  })

  test("uses the injected crypto seam", async () => {
    let calls = 0
    const base = defaultAuthCrypto()
    const crypto = {
      ...base,
      hmacSha256: (key: Uint8Array, message: Uint8Array) => {
        calls++
        return base.hmacSha256(key, message)
      },
    }
    const signer = hmacSessionSigner({ secret, crypto })
    const signature = await signer.sign("payload")
    await signer.verify("payload", signature)
    expect(calls).toBe(2)
  })
})
