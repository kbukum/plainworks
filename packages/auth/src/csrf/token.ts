import { isPositiveInteger } from "@plainworks/std"
import { base64urlEncode } from "@plainworks/std/encoding"
import type { AuthCrypto } from "../crypto"
import { AuthError } from "../errors"
import type { SessionSigner } from "../signer/seam"

/**
 * Anti-CSRF protection with a **signed, session-bound synchronizer token**. `SameSite=Strict` on
 * the session cookie is the primary defense; this token is the enforced defense-in-depth on every
 * state-changing (`POST`/`PUT`/`PATCH`/`DELETE`) request.
 *
 * A token is high-entropy CSPRNG output signed together with a per-session binding by the same
 * {@link SessionSigner} that protects the session cookie. The server hands it to the page, the
 * page echoes it in a header or form field, and the server checks it against the session it holds.
 * No CSRF cookie is involved: a token minted for one session fails under another session's
 * binding, and nobody can forge one without the server key.
 */
export interface CsrfProtection {
  /** Mint a fresh token bound to `binding` (a stable, per-session identifier). */
  issue(binding: string): Promise<string>
  /**
   * Verify the token echoed by a request against `binding`. Returns `false` for an empty token, one
   * longer than {@link MAX_CSRF_TOKEN_LENGTH}, a malformed token, or a signature that does not bind
   * the token to `binding`, so an absent, tampered, or foreign-session token never passes.
   */
  verify(binding: string, token: string): Promise<boolean>
}

/** How to build a {@link CsrfProtection}. */
export interface CsrfConfig {
  /** The signer binding a token to the session; the server-owned session signer by default. */
  readonly signer: SessionSigner
  /** CSPRNG source for the token's random half — never a seeded RNG. */
  readonly crypto: AuthCrypto
  /**
   * Random bytes per token; defaults to 32. Must be an integer from 16 (full cryptographic
   * entropy) to 64 (so the token stays within {@link MAX_CSRF_TOKEN_LENGTH}).
   */
  readonly byteLength?: number
}

/** The longest token {@link CsrfProtection.verify} reads; anything longer is rejected unchecked. */
export const MAX_CSRF_TOKEN_LENGTH = 256

const DEFAULT_TOKEN_BYTES = 32
const MIN_TOKEN_BYTES = 16
const MAX_TOKEN_BYTES = 64

// The canonical message the MAC covers — the session binding and the token's random half — so a
// token only verifies against the session it was minted for.
function bindingMessage(binding: string, random: string): string {
  return `csrf.${binding}.${random}`
}

/**
 * Build a {@link CsrfProtection}. A factory (no module-level state), so a per-request composition
 * shares the session signer with the cookie codec.
 *
 * @throws {AuthError} `auth/config` for a `byteLength` outside 16–64; `issue` rejects with
 *   `auth/config` when the signer's signature makes the token longer than the verifier accepts.
 */
export function createCsrf(config: CsrfConfig): CsrfProtection {
  const byteLength = config.byteLength ?? DEFAULT_TOKEN_BYTES
  if (
    !isPositiveInteger(byteLength) ||
    byteLength < MIN_TOKEN_BYTES ||
    byteLength > MAX_TOKEN_BYTES
  ) {
    throw new AuthError(
      "auth/config",
      `csrf byteLength must be an integer from ${MIN_TOKEN_BYTES} to ${MAX_TOKEN_BYTES}, got ${byteLength}`,
    )
  }
  return {
    async issue(binding: string): Promise<string> {
      const random = base64urlEncode(config.crypto.randomBytes(byteLength))
      const mac = await config.signer.sign(bindingMessage(binding, random))
      const token = `${random}.${mac}`
      if (token.length > MAX_CSRF_TOKEN_LENGTH) {
        throw new AuthError(
          "auth/config",
          `csrf token is ${token.length} characters; the signer must keep it within ${MAX_CSRF_TOKEN_LENGTH}`,
        )
      }
      return token
    },
    async verify(binding: string, token: string): Promise<boolean> {
      if (token.length === 0 || token.length > MAX_CSRF_TOKEN_LENGTH) {
        return false
      }
      const dot = token.indexOf(".")
      if (dot <= 0 || dot !== token.lastIndexOf(".")) {
        return false
      }
      const random = token.slice(0, dot)
      const mac = token.slice(dot + 1)
      // The MAC must verify under THIS session's binding, so a token minted for a different session
      // (or tampered) is rejected. The signer compares in constant time.
      return config.signer.verify(bindingMessage(binding, random), mac)
    },
  }
}
