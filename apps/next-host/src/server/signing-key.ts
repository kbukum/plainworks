import "server-only"

// The session-signing key for the running host. A deployment supplies `SESSION_SIGNING_KEY` (32
// bytes or more); without one the host mints a random key at startup, so a demo run still works
// while nobody can forge a `__Host-` session cookie from a value committed to this repository. An
// ephemeral key means sessions do not survive a restart — the deliberate trade for never shipping a
// usable secret. Production swaps `hmacSessionSigner` for a KMS-backed signer.

const MIN_KEY_BYTES = 32

/** Resolve the HMAC session-signing key: the configured secret, or a fresh random key. */
export function resolveSigningKey(configured = process.env.SESSION_SIGNING_KEY): Uint8Array {
  if (configured !== undefined) {
    const key = new TextEncoder().encode(configured)
    if (key.byteLength < MIN_KEY_BYTES) {
      throw new Error(`SESSION_SIGNING_KEY must be at least ${MIN_KEY_BYTES} bytes`)
    }
    return key
  }
  const key = new Uint8Array(MIN_KEY_BYTES)
  crypto.getRandomValues(key)
  return key
}
