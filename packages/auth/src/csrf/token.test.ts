import { describe, expect, test } from "vitest"
import { defaultAuthCrypto } from "../crypto"
import { AuthError } from "../errors"
import { hmacSessionSigner } from "../server/hmac-signer"
import type { SessionSigner } from "../signer/seam"
import { createCsrf } from "./token"

const key = new Uint8Array(32).fill(0x2a)
const signer: SessionSigner = hmacSessionSigner({ keys: [key] })
const crypto = defaultAuthCrypto()

describe("createCsrf issue", () => {
  test("mints a `random.mac` token from CSPRNG bytes bound to the session", async () => {
    const csrf = createCsrf({ signer, crypto })
    const token = await csrf.issue("session-1")
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  })

  test("draws its random half from the injected crypto for its length", async () => {
    let requested = -1
    const spy = {
      ...crypto,
      randomBytes: (length: number) => {
        requested = length
        return new Uint8Array(length).fill(1)
      },
    }
    const csrf = createCsrf({ signer, crypto: spy, byteLength: 16 })
    await csrf.issue("session-1")
    expect(requested).toBe(16)
  })

  test("refuses to mint a token the verifier would reject as too long", async () => {
    const wide: SessionSigner = { ...signer, sign: async () => "m".repeat(256) }
    const csrf = createCsrf({ signer: wide, crypto })
    await expect(csrf.issue("session-1")).rejects.toMatchObject({ kind: "auth/config" })
  })

  test("two mints for the same session do not collide", async () => {
    const csrf = createCsrf({ signer, crypto })
    expect(await csrf.issue("session-1")).not.toBe(await csrf.issue("session-1"))
  })
})

describe("createCsrf verify", () => {
  test("accepts a token minted for the same session", async () => {
    const csrf = createCsrf({ signer, crypto })
    const token = await csrf.issue("session-1")
    await expect(csrf.verify("session-1", token)).resolves.toBe(true)
  })

  test("rejects an empty token → false", async () => {
    const csrf = createCsrf({ signer, crypto })
    await expect(csrf.verify("session-1", "")).resolves.toBe(false)
  })

  test("rejects a token longer than the bound before checking its signature → false", async () => {
    let checked = false
    const counting: SessionSigner = {
      ...signer,
      verify: (message, mac) => {
        checked = true
        return signer.verify(message, mac)
      },
    }
    const csrf = createCsrf({ signer: counting, crypto })
    await expect(csrf.verify("session-1", `${"a".repeat(256)}.b`)).resolves.toBe(false)
    expect(checked).toBe(false)
  })

  test("rejects a token minted for a different (foreign) session → false", async () => {
    const csrf = createCsrf({ signer, crypto })
    // A token issued for session-2 and replayed against session-1 fails: its MAC does not verify
    // under session-1's binding.
    const foreign = await csrf.issue("session-2")
    await expect(csrf.verify("session-1", foreign)).resolves.toBe(false)
    await expect(csrf.verify("session-2", foreign)).resolves.toBe(true)
  })

  test("rejects a tampered token whose signature no longer binds → false", async () => {
    const csrf = createCsrf({ signer, crypto })
    const token = await csrf.issue("session-1")
    const [random, mac] = token.split(".")
    await expect(csrf.verify("session-1", `${random}x.${mac}`)).resolves.toBe(false)
  })

  test("rejects a token without a `random.mac` shape → false", async () => {
    const csrf = createCsrf({ signer, crypto })
    await expect(csrf.verify("session-1", "nodot")).resolves.toBe(false)
    await expect(csrf.verify("session-1", ".mac")).resolves.toBe(false)
    await expect(csrf.verify("session-1", "a.b.c")).resolves.toBe(false)
  })
})

describe("createCsrf configuration", () => {
  test("rejects invalid or insufficient byteLength with auth/config error", () => {
    for (const byteLength of [0, -1, 15, 65, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      expect(() => createCsrf({ signer, crypto, byteLength })).toThrow(AuthError)
      try {
        createCsrf({ signer, crypto, byteLength })
        expect.unreachable("expected an AuthError")
      } catch (error) {
        expect(error).toMatchObject({ kind: "auth/config" })
      }
    }
  })
})
