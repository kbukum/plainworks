import {
  base64urlDecode,
  base64urlEncode,
  type Clock,
  type InferSchemaOutput,
  type StandardSchemaV1,
  validateWithSchema,
} from "@plainworks/std"
import { AuthError } from "../errors"
import type { SessionSigner } from "../signer/seam"

/**
 * The signed session cookie's wire shape: the caller's validated session value plus issued-at and
 * absolute-expiry stamps (epoch **seconds**). It is signed as one canonical string so a tampered
 * value, `iat`, or `exp` all fail verification.
 */
interface SessionEnvelope<Value> {
  readonly v: Value
  readonly iat: number
  readonly exp: number
}

/** What the codec needs to mint and read a signed session cookie value. */
export interface SessionCodec<Schema extends StandardSchemaV1> {
  /** The signer that produces and verifies the integrity MAC. */
  readonly signer: SessionSigner
  /** Validates the decoded session value at read — a trust boundary over authenticated-but-untrusted data. */
  readonly schema: Schema
  /** The clock used to stamp and check absolute expiry. */
  readonly clock: Clock
  /** Absolute session lifetime in seconds; the encoded `exp` is `now + ttlSeconds`. */
  readonly ttlSeconds: number
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function isEnvelope(value: unknown): value is SessionEnvelope<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "v" in value &&
    typeof (value as { iat?: unknown }).iat === "number" &&
    typeof (value as { exp?: unknown }).exp === "number"
  )
}

/**
 * Encode and sign a session value into the cookie string `payload.mac` (`base64url` payload,
 * detached `base64url` MAC). Pure aside from the injected signer/clock.
 */
export async function encodeSession<Schema extends StandardSchemaV1>(
  codec: SessionCodec<Schema>,
  value: InferSchemaOutput<Schema>,
): Promise<string> {
  const nowSeconds = Math.floor(codec.clock.now() / 1000)
  const envelope: SessionEnvelope<InferSchemaOutput<Schema>> = {
    v: value,
    iat: nowSeconds,
    exp: nowSeconds + codec.ttlSeconds,
  }
  const payload = base64urlEncode(encoder.encode(JSON.stringify(envelope)))
  const mac = await codec.signer.sign(payload)
  return `${payload}.${mac}`
}

/**
 * Verify-at-read: authenticate the MAC, decode, check absolute expiry, then validate the value's
 * shape. Every failure is a typed {@link AuthError} — never a fabricated session:
 *
 * - malformed structure / bad signature / undecodable payload → `auth/session-invalid`
 * - authentic but past `exp` → `auth/session-expired`
 * - authentic and unexpired but failing the schema → `auth/session-invalid`
 *
 * The MAC is checked **before** the payload is parsed, so untrusted bytes are never JSON-parsed
 * until their integrity is proven.
 */
export async function decodeSession<Schema extends StandardSchemaV1>(
  codec: SessionCodec<Schema>,
  cookieValue: string,
): Promise<InferSchemaOutput<Schema>> {
  const dot = cookieValue.indexOf(".")
  if (dot <= 0 || dot !== cookieValue.lastIndexOf(".")) {
    throw new AuthError("auth/session-invalid", "session cookie is not a payload.mac pair")
  }
  const payload = cookieValue.slice(0, dot)
  const mac = cookieValue.slice(dot + 1)
  if (!(await codec.signer.verify(payload, mac))) {
    throw new AuthError("auth/session-invalid", "session cookie signature did not verify")
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(decoder.decode(base64urlDecode(payload)))
  } catch (cause) {
    throw new AuthError("auth/session-invalid", "session cookie payload is not decodable JSON", {
      cause,
    })
  }
  if (!isEnvelope(parsed)) {
    throw new AuthError("auth/session-invalid", "session cookie payload is not a session envelope")
  }
  if (Math.floor(codec.clock.now() / 1000) >= parsed.exp) {
    throw new AuthError("auth/session-expired", "session cookie is past its absolute lifetime")
  }
  const validated = await validateWithSchema(codec.schema, parsed.v)
  if (!validated.ok) {
    throw new AuthError("auth/session-invalid", "session value failed schema validation", {
      cause: validated.error,
    })
  }
  return validated.value
}
