import { base64urlEncode } from "@plainworks/std"
import type { AuthCrypto } from "../crypto"
import { constantTimeEqual } from "../crypto/constant-time"

/**
 * Anti-CSRF token helpers for the **double-submit** pattern. `SameSite=Strict` on the session
 * cookie is the primary defense; this token is defense-in-depth required on every state-changing
 * (`POST`/`PUT`/`PATCH`/`DELETE`) request: the same value is delivered both as a cookie and in a
 * request header/field, and the server accepts the request only when the two match.
 *
 * The value is high-entropy CSPRNG output, and the check is constant-time so a mismatch cannot be
 * probed byte by byte. Host-neutral — the BFF proxy and route guards consume these.
 */

const DEFAULT_TOKEN_BYTES = 32
const encoder = new TextEncoder()

/**
 * Mint a fresh anti-CSRF token: `byteLength` (default 32) cryptographically-random bytes,
 * `base64url`-encoded. The randomness comes from the injected {@link AuthCrypto} (a CSPRNG), never
 * a seeded RNG.
 */
export function mintCsrfToken(
  crypto: AuthCrypto,
  byteLength: number = DEFAULT_TOKEN_BYTES,
): string {
  return base64urlEncode(crypto.randomBytes(byteLength))
}

/**
 * Verify a double-submit pair in constant time: the token carried by the cookie against the token
 * echoed in the request header/field. Returns `false` for any mismatch or for an empty token on
 * either side — an empty or absent token never satisfies the check.
 */
export function verifyCsrfToken(cookieToken: string, requestToken: string): boolean {
  if (cookieToken.length === 0 || requestToken.length === 0) {
    return false
  }
  return constantTimeEqual(encoder.encode(cookieToken), encoder.encode(requestToken))
}
