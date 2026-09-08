/**
 * The cryptographic primitives `@plainworks/auth` needs for the secure OAuth paths — PKCE and the
 * per-request `state`/`nonce`/verifier randomness. It is an **injected seam**, not a hard import,
 * because `crypto.subtle` has real host variance (absent on older React Native) and must be
 * substitutable in tests: a host without Web Crypto supplies a polyfill instead of the core failing
 * to load.
 *
 * Every source of randomness here MUST be a CSPRNG. The seeded, deterministic RNG in `@plainworks/std`
 * (`createSeededRandom`) is a **non-secure** test tool and must never reach these paths.
 */
export interface AuthCrypto {
  /**
   * SHA-256 digest of `bytes` — the hash behind PKCE `S256`. Resolves to the raw 32-byte digest.
   */
  digestSha256(bytes: Uint8Array): Promise<Uint8Array>
  /**
   * `length` cryptographically-secure random bytes for a PKCE verifier, `state`, or `nonce`.
   */
  randomBytes(length: number): Uint8Array
  /**
   * HMAC-SHA256 of `message` under `key` — the MAC behind the signed `__Host-` session cookie.
   * Resolves to the raw 32-byte tag. `key` is the server's session-signing secret and never leaves
   * the server.
   */
  hmacSha256(key: Uint8Array, message: Uint8Array): Promise<Uint8Array>
}
