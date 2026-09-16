import { base64urlEncode } from "@plainworks/std"
import { describe, expect, it } from "vitest"
import { hmacSessionSigner } from "../server/hmac-signer"
import { signPayload, verifyPayload } from "./signed-payload"

const encoder = new TextEncoder()
const signer = hmacSessionSigner({ keys: [new Uint8Array(32).fill(7)] })

/** Build a `payload.mac` whose MAC authenticates `raw` (which need not be JSON). */
async function signRaw(raw: string): Promise<string> {
  const payload = base64urlEncode(encoder.encode(raw))
  const mac = await signer.sign(payload)
  return `${payload}.${mac}`
}

describe("verifyPayload", () => {
  it("round-trips a signed value", async () => {
    const token = await signPayload(signer, { hello: "world", n: 1 })
    expect(await verifyPayload(signer, token)).toEqual({ hello: "world", n: 1 })
  })

  it("rejects a string with no MAC separator", async () => {
    expect(await verifyPayload(signer, "no-dot-here")).toBeUndefined()
  })

  it("rejects a string with more than one separator", async () => {
    const token = await signPayload(signer, { a: 1 })
    expect(await verifyPayload(signer, `${token}.extra`)).toBeUndefined()
  })

  it("rejects a leading-dot payload", async () => {
    expect(await verifyPayload(signer, ".mac")).toBeUndefined()
  })

  it("rejects a tampered MAC", async () => {
    const token = await signPayload(signer, { a: 1 })
    const [payload] = token.split(".")
    expect(await verifyPayload(signer, `${payload}.AAAA`)).toBeUndefined()
  })

  it("rejects an authenticated payload that is not decodable JSON", async () => {
    expect(await verifyPayload(signer, await signRaw("not json{"))).toBeUndefined()
  })
})
