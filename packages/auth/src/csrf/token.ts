import { base64urlEncode } from "@plainworks/std"
import type { AuthCrypto } from "../crypto"
import { constantTimeEqual } from "../crypto/constant-time"
import { AuthError } from "../errors"
import type { SessionSigner } from "../signer/seam"

/**
 * Anti-CSRF protection for the **signed, session-bound double-submit** pattern. `SameSite=Strict`
 * on the session cookie is the primary defense; this token is the enforced defense-in-depth on
 * every state-changing (`POST`/`PUT`/`PATCH`/`DELETE`) request.
 *
 * A token is high-entropy CSPRNG output **bound to the current session** and signed with the same
 * {@link SessionSigner} that protects the session cookie: the random bytes and a session-binding
 * string are MAC'd together, so a token minted for one session cannot be replayed against another
 * (its MAC does not verify under the other session's binding), and neither side can be forged
 * without the server key. The package owns **both halves** — it mints the token (written to a
 * `__Host-` cookie by the server composition) and verifies the cookie value against the
 * header/field echo. Every comparison is constant-time so a mismatch cannot be probed byte by byte.
 */
export interface CsrfProtection {
  /** Mint a fresh token bound to `binding` (a stable, per-session identifier). */
  issue(binding: string): Promise<string>
  /**
   * Verify a double-submit pair for `binding`: the token carried by the cookie against the token
   * echoed in the request header/field. Returns `false` for an empty token on either side, a
   * mismatch between the two, a malformed token, or a signature that does not bind the token to
   * `binding` — an absent, tampered, or foreign-session token never satisfies the check.
   */
  verify(binding: string, cookieToken: string, requestToken: string): Promise<boolean>
}

/** How to build a {@link CsrfProtection}. */
export interface CsrfConfig {
  /** The signer binding a token to the session; the server-owned session signer by default. */
  readonly signer: SessionSigner
  /** CSPRNG source for the token's random half — never a seeded RNG. */
  readonly crypto: AuthCrypto
  /**
   * Random bytes per token; defaults to 32. Must be an integer of at least 16 bytes for full
   * cryptographic entropy.
   */
  readonly byteLength?: number
}

const DEFAULT_TOKEN_BYTES = 32
const MIN_TOKEN_BYTES = 16
const encoder = new TextEncoder()

// The canonical message the MAC covers — the session binding and the token's random half — so a
// token only verifies against the session it was minted for.
function bindingMessage(binding: string, random: string): string {
  return `csrf.${binding}.${random}`
}

/**
 * Build a {@link CsrfProtection}. A factory (no module-level state), so a per-request composition
 * shares the session signer with the cookie codec and both halves of the pattern live in the
 * package.
 */
export function createCsrf(config: CsrfConfig): CsrfProtection {
  const byteLength = config.byteLength ?? DEFAULT_TOKEN_BYTES
  if (!Number.isInteger(byteLength) || byteLength < MIN_TOKEN_BYTES) {
    throw new AuthError(
      "auth/config",
      `csrf byteLength must be an integer of at least ${MIN_TOKEN_BYTES} bytes, got ${byteLength}`,
    )
  }
  return {
    async issue(binding: string): Promise<string> {
      const random = base64urlEncode(config.crypto.randomBytes(byteLength))
      const mac = await config.signer.sign(bindingMessage(binding, random))
      return `${random}.${mac}`
    },
    async verify(binding: string, cookieToken: string, requestToken: string): Promise<boolean> {
      if (cookieToken.length === 0 || requestToken.length === 0) {
        return false
      }
      // Double-submit: the cookie value and the echoed value must match, constant-time.
      if (!constantTimeEqual(encoder.encode(cookieToken), encoder.encode(requestToken))) {
        return false
      }
      const dot = cookieToken.indexOf(".")
      if (dot <= 0 || dot !== cookieToken.lastIndexOf(".")) {
        return false
      }
      const random = cookieToken.slice(0, dot)
      const mac = cookieToken.slice(dot + 1)
      // Session binding: the MAC must verify under THIS session's binding, so a token minted for a
      // different session (or tampered) is rejected.
      return config.signer.verify(bindingMessage(binding, random), mac)
    },
  }
}
