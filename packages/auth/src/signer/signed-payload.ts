import { base64urlDecode, base64urlEncode } from "@plainworks/std"
import type { SessionSigner } from "./seam"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * Sign an arbitrary JSON-serializable value into the opaque `payload.mac` string the kit carries
 * across a round trip (a `base64url` JSON payload plus a detached `base64url` MAC). The canonical
 * lower owner of the signed-payload wire shape — the session envelope, the login transaction, and
 * the server-session's return-target envelope all reuse it rather than re-deriving the encoding.
 */
export async function signPayload(signer: SessionSigner, value: unknown): Promise<string> {
  const payload = base64urlEncode(encoder.encode(JSON.stringify(value)))
  const mac = await signer.sign(payload)
  return `${payload}.${mac}`
}

/**
 * Verify and decode a {@link signPayload} string: authenticate the MAC **before** parsing the
 * untrusted bytes, then JSON-parse. Returns the parsed value as `unknown` (the caller narrows), or
 * `undefined` when the string is malformed, the signature does not verify, or the payload is not
 * decodable JSON — a fail-closed read that never throws and never yields unauthenticated data.
 */
export async function verifyPayload(signer: SessionSigner, token: string): Promise<unknown> {
  const dot = token.indexOf(".")
  if (dot <= 0 || dot !== token.lastIndexOf(".")) {
    return undefined
  }
  const payload = token.slice(0, dot)
  const mac = token.slice(dot + 1)
  if (!(await signer.verify(payload, mac))) {
    return undefined
  }
  try {
    return JSON.parse(decoder.decode(base64urlDecode(payload)))
  } catch {
    return undefined
  }
}
