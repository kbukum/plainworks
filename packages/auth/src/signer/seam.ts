/**
 * The **signing seam** for a session cookie's integrity tag. A signer turns a canonical message
 * into a detached MAC and verifies one in constant time. It is injected — the default HMAC
 * implementation (`hmacSessionSigner`) holds the server's signing secret and therefore lives in the
 * quarantined `@plainworks/auth/server` entry, never in a client graph — while the codec and cookie
 * store that *consume* a signer stay host-neutral in the `.` graph.
 *
 * A BYO deployment can supply an asymmetric or KMS-backed signer instead; only this seam is
 * required.
 */
export interface SessionSigner {
  /** Produce a detached, `base64url` MAC over `message`. */
  sign(message: string): Promise<string>
  /**
   * Verify a detached MAC against `message` in constant time. Returns `false` for a bad or
   * malformed signature — it never throws for a mismatch, so verify-at-read maps a `false` to a
   * typed `auth/session-invalid` and treats the caller as unauthenticated.
   */
  verify(message: string, signature: string): Promise<boolean>
}
