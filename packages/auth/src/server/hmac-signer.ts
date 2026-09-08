import { base64urlDecode, base64urlEncode } from "@plainworks/std"
import { type AuthCrypto, defaultAuthCrypto } from "../crypto"
import { constantTimeEqual } from "../crypto/constant-time"
import { AuthError } from "../errors"
import type { SessionSigner } from "../signer/seam"

/** How to build the default HMAC {@link SessionSigner}. */
export interface HmacSignerConfig {
  /**
   * The session-signing secret — a server secret that must never reach a client bundle (which the
   * `@plainworks/auth/server` import boundary enforces). At least 32 bytes so the HMAC-SHA256 key has
   * full strength; a shorter secret is a configuration error.
   */
  readonly secret: Uint8Array
  /** The crypto seam; defaults to the host's Web Crypto ({@link defaultAuthCrypto}). */
  readonly crypto?: AuthCrypto
}

const MIN_SECRET_BYTES = 32
const encoder = new TextEncoder()

/**
 * The default {@link SessionSigner}: HMAC-SHA256 over the message, `base64url`-encoded, verified in
 * constant time. It **holds the signing secret**, so it is exported only from
 * `@plainworks/auth/server` and must never be imported into a `"use client"` module. Verification
 * recomputes the tag and compares with {@link constantTimeEqual}; a malformed `base64url` signature
 * yields `false` rather than throwing, so a tampered cookie is uniformly unauthenticated.
 *
 * @throws {AuthError} `auth/config` when `secret` is shorter than 32 bytes.
 */
export function hmacSessionSigner(config: HmacSignerConfig): SessionSigner {
  if (config.secret.length < MIN_SECRET_BYTES) {
    throw new AuthError(
      "auth/config",
      `session signing secret must be at least ${MIN_SECRET_BYTES} bytes, got ${config.secret.length}`,
    )
  }
  const crypto = config.crypto ?? defaultAuthCrypto()
  const secret = config.secret
  return {
    async sign(message: string): Promise<string> {
      const tag = await crypto.hmacSha256(secret, encoder.encode(message))
      return base64urlEncode(tag)
    },
    async verify(message: string, signature: string): Promise<boolean> {
      let provided: Uint8Array
      try {
        provided = base64urlDecode(signature)
      } catch {
        return false
      }
      const expected = await crypto.hmacSha256(secret, encoder.encode(message))
      return constantTimeEqual(expected, provided)
    },
  }
}
