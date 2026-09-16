import { base64urlDecode, base64urlEncode } from "@plainworks/std"
import { type AuthCrypto, defaultAuthCrypto } from "../crypto"
import { constantTimeEqual } from "../crypto/constant-time"
import { AuthError } from "../errors"
import type { SessionSigner } from "../signer/seam"

/** How to build the default HMAC {@link SessionSigner}. */
export interface HmacSignerConfig {
  /**
   * The ordered keyset backing the signer. The **first** key is the active signing key (newest);
   * every key in the set is accepted at verification, so rotating a fresh key in at the front keeps
   * sessions signed under any still-accepted key valid. Retire a key by dropping it from the set —
   * a cookie signed under a removed key then fails to verify.
   *
   * Each key is a server secret that must never reach a client bundle (which the
   * `@plainworks/auth/server` import boundary enforces), and must be at least 32 bytes so the
   * HMAC-SHA256 key has full strength; a shorter key — or an empty keyset — is a configuration
   * error.
   */
  readonly keys: readonly Uint8Array[]
  /** The crypto seam; defaults to the host's Web Crypto ({@link defaultAuthCrypto}). */
  readonly crypto?: AuthCrypto
}

const MIN_SECRET_BYTES = 32
const encoder = new TextEncoder()

/**
 * The default {@link SessionSigner}: HMAC-SHA256 over the message, `base64url`-encoded, verified in
 * constant time. It **holds the signing keys**, so it is exported only from
 * `@plainworks/auth/server` and must never be imported into a `"use client"` module.
 *
 * Signing uses the active (first) key. Verification recomputes the tag under **every** accepted key
 * and folds the results without an early return, so a session minted under the previous active key
 * still verifies after a new key is rotated to the front, while a key dropped from the set no
 * longer verifies — key rotation never invalidates a live session, and no timing side channel
 * reveals which key matched. A malformed `base64url` signature yields `false` rather than throwing,
 * so a tampered cookie is uniformly unauthenticated.
 *
 * @throws {AuthError} `auth/config` when the keyset is empty or any key is shorter than 32 bytes.
 */
export function hmacSessionSigner(config: HmacSignerConfig): SessionSigner {
  if (config.keys.length === 0) {
    throw new AuthError("auth/config", "session signing keyset must contain at least one key")
  }
  for (const key of config.keys) {
    if (key.length < MIN_SECRET_BYTES) {
      throw new AuthError(
        "auth/config",
        `session signing key must be at least ${MIN_SECRET_BYTES} bytes, got ${key.length}`,
      )
    }
  }
  const crypto = config.crypto ?? defaultAuthCrypto()
  const keys = [...config.keys]
  const activeKey = keys[0] as Uint8Array
  return {
    async sign(message: string): Promise<string> {
      const tag = await crypto.hmacSha256(activeKey, encoder.encode(message))
      return base64urlEncode(tag)
    },
    async verify(message: string, signature: string): Promise<boolean> {
      let provided: Uint8Array
      try {
        provided = base64urlDecode(signature)
      } catch {
        return false
      }
      const bytes = encoder.encode(message)
      // Try every accepted key and fold the outcomes without an early return: a match under any key
      // in the set passes, and the loop timing never reveals which key (if any) matched.
      let matched = false
      for (const key of keys) {
        const expected = await crypto.hmacSha256(key, bytes)
        matched = constantTimeEqual(expected, provided) || matched
      }
      return matched
    },
  }
}
