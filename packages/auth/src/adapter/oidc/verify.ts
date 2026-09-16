import type { WebFetch } from "@plainworks/std"
import { createLocalJWKSet, createRemoteJWKSet, customFetch, jwtVerify } from "jose"
import { AuthError } from "../../errors"

/**
 * The verified claims of a token — the JWT payload. `sub` is the principal identifier every OIDC
 * token carries; the rest is the provider/app-owned claim vocabulary a consumer narrows with its
 * own predicates.
 */
export type VerifiedClaims = Readonly<Record<string, unknown>> & { readonly sub?: unknown }

/** A JWKS-backed JWT verifier for the ID token and any bearer access token. */
export interface JwtVerifier {
  /**
   * Verify an OIDC ID token against the provider JWKS: signature (pinned algorithms, never `none`),
   * `iss`, `aud`, `exp`. When `expectedNonce` is given (the initial Authorization Code exchange),
   * the token's `nonce` must match it; on a token refresh the `nonce` claim no longer applies, so
   * the argument is omitted and the check is skipped. Throws `auth/adapter` on any failure.
   */
  verifyIdToken(idToken: string, expectedNonce?: string): Promise<VerifiedClaims>
  /**
   * Verify a bearer access token (JWT) against the provider JWKS: signature (pinned algorithms,
   * never `none`), `iss`, `aud`, `exp`. Throws `auth/adapter` on any failure.
   */
  verifyAccessToken(token: string): Promise<VerifiedClaims>
}

/** How to build a {@link JwtVerifier}. */
export interface JwtVerifierConfig {
  /** The provider JWKS URL (for remote JWKS resolution). */
  readonly jwksUri?: string | undefined
  /** The provider JWKS document (offline/local fallback). */
  readonly jwks?: { readonly keys: readonly unknown[] } | undefined
  /** Injected fetch implementation for remote JWKS. */
  readonly fetch?: WebFetch | undefined
  /** Expected token issuer. */
  readonly issuer: string
  /** Expected audience — the client id. */
  readonly audience: string
  /** Accepted JWS algorithms; `none` is never included, so an unsigned token is always rejected. */
  readonly algorithms: readonly string[]
  /** Timeout for remote JWKS fetch in milliseconds; defaults to 5_000. */
  readonly timeoutMs?: number | undefined
  /** Cooldown duration between remote JWKS refreshes on unknown kid in milliseconds; defaults to 5_000. */
  readonly cooldownDurationMs?: number | undefined
}

/**
 * Build a {@link JwtVerifier} over a remote or local JWKS using `jose`. Verification pins
 * the accepted `algorithms` (rejecting `alg: none` and any downgrade) and asserts
 * `iss`/`aud`/`exp`; the ID-token path additionally binds the `nonce`. Every failure is normalized
 * to a typed `auth/adapter` {@link AuthError} that preserves the underlying cause.
 */
export function createJwtVerifier(config: JwtVerifierConfig): JwtVerifier {
  const algorithms = [...config.algorithms]

  let keySet: ReturnType<typeof createLocalJWKSet> | ReturnType<typeof createRemoteJWKSet>

  if (config.jwksUri !== undefined && config.fetch !== undefined) {
    const fetchImpl = config.fetch
    keySet = createRemoteJWKSet(new URL(config.jwksUri), {
      [customFetch]: (url, init) => fetchImpl(url, init as never),
      timeoutDuration: config.timeoutMs ?? 5_000,
      cooldownDuration: config.cooldownDurationMs ?? 5_000,
    })
  } else if (config.jwks !== undefined) {
    keySet = createLocalJWKSet({ keys: config.jwks.keys as never })
  } else {
    throw new AuthError(
      "auth/config",
      "JwtVerifier requires either jwksUri with fetch, or a local jwks",
    )
  }

  async function verify(token: string): Promise<VerifiedClaims> {
    const { payload } = await jwtVerify(token, keySet, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms,
    })
    return payload as VerifiedClaims
  }

  return {
    async verifyIdToken(idToken: string, expectedNonce?: string): Promise<VerifiedClaims> {
      let claims: VerifiedClaims
      try {
        claims = await verify(idToken)
      } catch (cause) {
        throw new AuthError("auth/adapter", "ID token verification failed", { cause })
      }
      if (expectedNonce !== undefined && claims.nonce !== expectedNonce) {
        throw new AuthError("auth/adapter", "ID token nonce did not match the login transaction")
      }
      return claims
    },
    async verifyAccessToken(token: string): Promise<VerifiedClaims> {
      try {
        return await verify(token)
      } catch (cause) {
        throw new AuthError("auth/adapter", "access token verification failed", { cause })
      }
    },
  }
}
