import { base64urlEncode, type Clock } from "@plainworks/std"
import { describe, expect, it } from "vitest"
import { hmacSessionSigner } from "../../server/hmac-signer"
import { signPayload } from "../../signer/signed-payload"
import { type LoginTransaction, signTransaction, verifyTransaction } from "./transaction"

const encoder = new TextEncoder()
const signer = hmacSessionSigner({ keys: [new Uint8Array(32).fill(9)] })
const clockAt = (ms: number): Clock => ({ now: () => ms })

const TX: LoginTransaction = {
  codeVerifier: "verifier",
  state: "state-123",
  nonce: "nonce-123",
  returnTo: "/dashboard",
  iat: 1_000,
}

const TTL = 600

async function signRaw(raw: string): Promise<string> {
  const payload = base64urlEncode(encoder.encode(raw))
  const mac = await signer.sign(payload)
  return `${payload}.${mac}`
}

async function expectAdapterError(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toMatchObject({ kind: "auth/adapter" })
}

describe("verifyTransaction", () => {
  it("round-trips a fresh transaction", async () => {
    const token = await signTransaction(signer, TX)
    expect(await verifyTransaction(signer, clockAt(1_000_000), TTL, token)).toEqual(TX)
  })

  it("rejects a string with no MAC separator", async () => {
    await expectAdapterError(verifyTransaction(signer, clockAt(1_000_000), TTL, "no-dot"))
  })

  it("rejects a tampered signature", async () => {
    const token = await signTransaction(signer, TX)
    const [payload] = token.split(".")
    await expectAdapterError(verifyTransaction(signer, clockAt(1_000_000), TTL, `${payload}.AAAA`))
  })

  it("rejects an authenticated payload that is not decodable JSON", async () => {
    await expectAdapterError(
      verifyTransaction(signer, clockAt(1_000_000), TTL, await signRaw("x{")),
    )
  })

  it("rejects an authenticated payload with the wrong shape", async () => {
    const token = await signPayload(signer, { codeVerifier: "only" })
    await expectAdapterError(verifyTransaction(signer, clockAt(1_000_000), TTL, token))
  })

  it("rejects a transaction older than its TTL", async () => {
    const token = await signTransaction(signer, TX)
    // iat = 1_000s; now = (1_000 + TTL + 1)s in ms → just past the window.
    const expiredNow = (TX.iat + TTL + 1) * 1000
    await expectAdapterError(verifyTransaction(signer, clockAt(expiredNow), TTL, token))
  })
})
