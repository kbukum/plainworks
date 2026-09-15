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
export interface SessionEnvelope<Value> {
  readonly v: Value
  readonly iat: number
  readonly exp: number
  /** Optional server-side session handle identifying this session's token custody slot. */
  readonly sid?: string
}

/**
 * The injected revocation seam — a server-side check run at read once a session's integrity, shape,
 * and freshness are proven, so a still-unexpired session can be invalidated out of band (a sign-out
 * everywhere, a compromised credential). Returns `true` to reject the session as revoked. It is a
 * seam, not a built-in store, so the revocation source (a Redis set, a DB row, an in-memory set in
 * a test) is the consumer's, checked against the authenticated envelope (its `iat`/`exp` and the
 * validated session `v`).
 */
export type RevocationCheck<Value> = (
  envelope: SessionEnvelope<Value>,
) => boolean | Promise<boolean>

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
  /**
   * Tolerance in seconds for an `iat` that appears slightly in the future because of clock skew
   * between the minting and reading hosts. An `iat` beyond `now + clockSkewSeconds` is rejected as
   * an impossible (forged/replayed) envelope. Defaults to 60 seconds.
   */
  readonly clockSkewSeconds?: number
  /**
   * Optional freshness bound in seconds: a session older than this since its `iat` is rejected even
   * when still within its absolute `exp`, forcing a periodic re-authentication independent of the
   * cookie lifetime. Omit to bound age by `exp` alone.
   */
  readonly maxAgeSeconds?: number
  /** Optional revocation seam checked at read (see {@link RevocationCheck}). */
  readonly isRevoked?: RevocationCheck<InferSchemaOutput<Schema>>
}

const DEFAULT_CLOCK_SKEW_SECONDS = 60
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
  sid?: string,
): Promise<string> {
  const nowSeconds = Math.floor(codec.clock.now() / 1000)
  const envelope: SessionEnvelope<InferSchemaOutput<Schema>> = {
    v: value,
    iat: nowSeconds,
    exp: nowSeconds + codec.ttlSeconds,
    ...(sid !== undefined ? { sid } : {}),
  }
  const payload = base64urlEncode(encoder.encode(JSON.stringify(envelope)))
  const mac = await codec.signer.sign(payload)
  return `${payload}.${mac}`
}

/**
 * Verify-at-read: authenticate the MAC, decode, reject impossible/stale/revoked stamps, then
 * validate the value's shape. Every failure is a typed {@link AuthError} — never a fabricated
 * session:
 *
 * - malformed structure / bad signature / undecodable payload → `auth/session-invalid`
 * - impossible timestamps (`exp <= iat`) or a future `iat` beyond the skew tolerance →
 *   `auth/session-invalid`
 * - authentic but past `exp`, or older than the freshness bound → `auth/session-expired`
 * - authentic and fresh but explicitly revoked → `auth/session-revoked`
 * - authentic and unexpired but failing the schema → `auth/session-invalid`
 *
 * The MAC is checked **before** the payload is parsed, so untrusted bytes are never JSON-parsed
 * until their integrity is proven.
 */
export async function decodeSessionEnvelope<Schema extends StandardSchemaV1>(
  codec: SessionCodec<Schema>,
  cookieValue: string,
): Promise<SessionEnvelope<InferSchemaOutput<Schema>>> {
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
  const nowSeconds = Math.floor(codec.clock.now() / 1000)
  const clockSkewSeconds = codec.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS
  // An envelope whose expiry does not follow its issue time can never have been minted by the codec
  // and is a forgery/replay attempt; reject it before any time comparison trusts the stamps.
  if (parsed.exp <= parsed.iat) {
    throw new AuthError("auth/session-invalid", "session envelope has impossible timestamps")
  }
  // An `iat` beyond the skew tolerance was never issued in this timeline (a forged forward-dated
  // token that would otherwise dodge the freshness bound).
  if (parsed.iat > nowSeconds + clockSkewSeconds) {
    throw new AuthError("auth/session-invalid", "session envelope is issued in the future")
  }
  if (nowSeconds >= parsed.exp) {
    throw new AuthError("auth/session-expired", "session cookie is past its absolute lifetime")
  }
  if (codec.maxAgeSeconds !== undefined && nowSeconds - parsed.iat > codec.maxAgeSeconds) {
    throw new AuthError("auth/session-expired", "session cookie is older than the freshness bound")
  }
  const validated = await validateWithSchema(codec.schema, parsed.v)
  if (!validated.ok) {
    throw new AuthError("auth/session-invalid", "session value failed schema validation", {
      cause: validated.error,
    })
  }
  const envelope: SessionEnvelope<InferSchemaOutput<Schema>> = {
    v: validated.value,
    iat: parsed.iat,
    exp: parsed.exp,
    ...(typeof (parsed as { sid?: unknown }).sid === "string"
      ? { sid: (parsed as { sid: string }).sid }
      : {}),
  }
  if (codec.isRevoked !== undefined && (await codec.isRevoked(envelope))) {
    throw new AuthError("auth/session-revoked", "session has been revoked")
  }
  return envelope
}

export async function decodeSession<Schema extends StandardSchemaV1>(
  codec: SessionCodec<Schema>,
  cookieValue: string,
): Promise<InferSchemaOutput<Schema>> {
  const envelope = await decodeSessionEnvelope(codec, cookieValue)
  return envelope.v
}
