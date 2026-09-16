import type { WebAbortSignal, WebFetch } from "@plainworks/std"
import { raceAbort } from "@plainworks/std"
import { createLocalJWKSet, createRemoteJWKSet, customFetch, errors, jwtVerify } from "jose"
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
   * the argument is omitted and the check is skipped. `signal` cancels a remote JWKS fetch.
   * Throws `auth/token-invalid` for a bad credential and `auth/adapter` for an infrastructure
   * fault.
   */
  verifyIdToken(
    idToken: string,
    expectedNonce?: string,
    signal?: WebAbortSignal,
  ): Promise<VerifiedClaims>
  /**
   * Verify a bearer access token (JWT) against the provider JWKS: signature (pinned algorithms,
   * never `none`), `iss`, `aud`, `exp`. `signal` cancels a remote JWKS fetch. Throws
   * `auth/token-invalid` for a bad credential and `auth/adapter` for an infrastructure fault.
   */
  verifyAccessToken(token: string, signal?: WebAbortSignal): Promise<VerifiedClaims>
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
  /**
   * Cooldown duration between remote JWKS refreshes on unknown kid in milliseconds; defaults to
   * 5_000.
   */
  readonly cooldownDurationMs?: number | undefined
}

/**
 * Build a {@link JwtVerifier} over a remote or local JWKS using `jose`. Verification pins
 * the accepted `algorithms` (rejecting `alg: none` and any downgrade) and asserts
 * `iss`/`aud`/`exp`; the ID-token path additionally binds the `nonce`.
 *
 * Failures are classified so a caller can tell a bad credential from an outage: a token that fails
 * validation (signature, claims, expiry, disallowed algorithm, unknown key) becomes
 * `auth/token-invalid`, while a JWKS fetch timeout, transport failure, or malformed key document
 * becomes `auth/adapter` — an operational fault that must not masquerade as a 401. Every error
 * preserves its underlying cause.
 */
export function createJwtVerifier(config: JwtVerifierConfig): JwtVerifier {
  const algorithms = [...config.algorithms]

  let keySet: ReturnType<typeof createLocalJWKSet> | ReturnType<typeof createRemoteJWKSet>

  if (config.jwksUri !== undefined && config.fetch !== undefined) {
    const fetchImpl = config.fetch
    keySet = createRemoteJWKSet(new URL(config.jwksUri), {
      // jose types `customFetch` against the DOM `Response`; the injected seam returns the
      // universal `WebResponse`, which is the same value at runtime on every target host.
      [customFetch]: (url, init) => fetchImpl(url, init as never) as never,
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

  async function verify(token: string, signal?: WebAbortSignal): Promise<VerifiedClaims> {
    const { payload } = await raceAbort(
      jwtVerify(token, keySet, {
        issuer: config.issuer,
        audience: config.audience,
        algorithms,
        requiredClaims: ["exp"],
      }),
      signal,
    )
    return payload as VerifiedClaims
  }

  return {
    async verifyIdToken(
      idToken: string,
      expectedNonce?: string,
      signal?: WebAbortSignal,
    ): Promise<VerifiedClaims> {
      let claims: VerifiedClaims
      try {
        claims = await verify(idToken, signal)
      } catch (cause) {
        throw classifyVerifyError("ID token", cause)
      }
      if (expectedNonce !== undefined && claims.nonce !== expectedNonce) {
        throw new AuthError(
          "auth/token-invalid",
          "ID token nonce did not match the login transaction",
        )
      }
      return claims
    },
    async verifyAccessToken(token: string, signal?: WebAbortSignal): Promise<VerifiedClaims> {
      try {
        return await verify(token, signal)
      } catch (cause) {
        throw classifyVerifyError("access token", cause)
      }
    },
  }
}

// A JWKS fetch timeout, transport failure, or malformed key document is an infrastructure fault —
// not a bad token — so it stays `auth/adapter` and a caller can surface it instead of a silent 401.
const INFRASTRUCTURE_JOSE_CODES = new Set(["ERR_JWKS_TIMEOUT", "ERR_JWKS_INVALID"])

function classifyVerifyError(kind: string, cause: unknown): AuthError {
  if (cause instanceof errors.JOSEError && !INFRASTRUCTURE_JOSE_CODES.has(cause.code)) {
    return new AuthError("auth/token-invalid", `${kind} verification failed`, { cause })
  }
  return new AuthError("auth/adapter", `${kind} verification could not complete`, { cause })
}
