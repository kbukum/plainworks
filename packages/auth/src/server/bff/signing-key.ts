import { type AuthCrypto, defaultAuthCrypto } from "../../crypto"
import { AuthError } from "../../errors"

/** The shortest accepted HMAC-SHA256 session-signing key, in bytes. */
export const MIN_SIGNING_KEY_BYTES: number = 32

/** Options for {@link resolveSigningKey}. */
export interface ResolveSigningKeyOptions {
  /** The configured secret, usually read from the environment by the host. */
  readonly configured: string | undefined
  /**
   * Whether a missing key may be replaced by a random one. Sessions then do not survive a restart.
   * Pass `true` only outside production (for example `NODE_ENV !== "production"`).
   */
  readonly allowEphemeral: boolean
  /** Randomness for an ephemeral key. Defaults to the platform Web Crypto. */
  readonly crypto?: AuthCrypto
}

/**
 * Resolve the HMAC session-signing key. A configured key must be at least
 * {@link MIN_SIGNING_KEY_BYTES} bytes of UTF-8. Without one, a random key is minted only when
 * `allowEphemeral` is set, so a production deployment never runs on a key it did not choose.
 *
 * @throws {AuthError} `auth/config` when the configured key is too short, or when no key is
 *   configured and ephemeral keys are not allowed.
 */
export function resolveSigningKey(options: ResolveSigningKeyOptions): Uint8Array {
  const { configured } = options
  if (configured !== undefined && configured.length > 0) {
    const key = new TextEncoder().encode(configured)
    if (key.byteLength < MIN_SIGNING_KEY_BYTES) {
      throw new AuthError(
        "auth/config",
        `Session signing key must be at least ${MIN_SIGNING_KEY_BYTES} bytes`,
      )
    }
    return key
  }
  if (!options.allowEphemeral) {
    throw new AuthError("auth/config", "Session signing key is required")
  }
  return (options.crypto ?? defaultAuthCrypto()).randomBytes(MIN_SIGNING_KEY_BYTES)
}
