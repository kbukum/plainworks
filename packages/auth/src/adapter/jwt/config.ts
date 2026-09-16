import type { WebFetch } from "@plainworks/std"
import { AuthError } from "../../errors"

/** The registry kind under which the stateless JWT bearer-verifier adapter registers. */
export const JWT_ADAPTER_KIND = "jwt"

/**
 * Config for the stateless `jwt` adapter — a bearer-token verifier for direct-token backends (the
 * interop default when a BFF session cookie is not in play). It verifies an inbound JWT against the
 * provider JWKS with Web Crypto (via `jose`), pins the accepted algorithms, and never mints or
 * custodies a token, so it is host-neutral and lives on the `.` entry.
 */
export interface JwtAdapterConfig {
  readonly kind: typeof JWT_ADAPTER_KIND
  /** Expected token issuer (`iss`) — a valid http(s) URL. */
  readonly issuer: string
  /** Expected audience (`aud`) — this resource server's identifier. */
  readonly audience: string
  /** The provider JWKS URL; requires {@link JwtAdapterConfig.fetch} for retrieval. */
  readonly jwksUri?: string
  /** A local JWKS document, for an offline/pinned key set with no network. */
  readonly jwks?: { readonly keys: readonly unknown[] }
  /**
   * The `fetch` seam for remote JWKS retrieval. Defaults to the host's global `fetch` (resolved at
   * call time, never import time), mirroring `@plainworks/http`'s `options.fetch`.
   */
  readonly fetch?: WebFetch
  /** Accepted JWS algorithms; defaults to `["RS256", "ES256"]`. `none` can never appear. */
  readonly algorithms?: readonly string[]
  /** Timeout for a remote JWKS fetch in milliseconds; defaults to 5_000. */
  readonly timeoutMs?: number
  /**
   * Cooldown between remote JWKS refreshes on an unknown key id in milliseconds; defaults to 5_000.
   */
  readonly cooldownDurationMs?: number
  /**
   * Header carrying the bearer credential; defaults to `Authorization`. Header-only, never a URL.
   */
  readonly headerName?: string
  /** Auth scheme prefix expected before the token; defaults to `Bearer`. */
  readonly scheme?: string
  /** The claim naming the principal; defaults to `sub`. */
  readonly subjectClaim?: string
}

const DEFAULT_ALGORITHMS = ["RS256", "ES256"] as const

function requireHttpUrl(value: unknown, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AuthError(
      "auth/config",
      `JWT adapter config requires a non-empty string \`${field}\``,
    )
  }
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error()
    }
  } catch {
    throw new AuthError(
      "auth/config",
      `JWT adapter config \`${field}\` must be a valid http(s) URL`,
    )
  }
}

function requirePositiveInteger(value: unknown, field: string): void {
  if (
    value !== undefined &&
    (typeof value !== "number" || !Number.isInteger(value) || value <= 0)
  ) {
    throw new AuthError("auth/config", `JWT adapter config \`${field}\` must be a positive integer`)
  }
}

function requireOptionalNonEmptyString(value: unknown, field: string): void {
  if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) {
    throw new AuthError("auth/config", `JWT adapter config \`${field}\` must be a non-empty string`)
  }
}

/** A local JWKS must be an object with a `keys` array of JWK objects before it reaches jose. */
function requireJwks(value: unknown): void {
  if (value === undefined) {
    return
  }
  const keys = (value as { keys?: unknown }).keys
  if (
    typeof value !== "object" ||
    value === null ||
    !Array.isArray(keys) ||
    keys.some((key) => typeof key !== "object" || key === null)
  ) {
    throw new AuthError(
      "auth/config",
      "JWT adapter config `jwks` must be an object with a `keys` array of JWK objects",
    )
  }
}

/** Validate and narrow unknown input to {@link JwtAdapterConfig}. */
export function validateJwtAdapterConfig(config: unknown): JwtAdapterConfig {
  if (typeof config !== "object" || config === null) {
    throw new AuthError("auth/config", "JWT adapter config must be a non-null object")
  }
  const candidate = config as Record<string, unknown>
  if (candidate.kind !== JWT_ADAPTER_KIND) {
    throw new AuthError("auth/config", `JWT adapter config kind must be "${JWT_ADAPTER_KIND}"`)
  }
  requireHttpUrl(candidate.issuer, "issuer")
  if (typeof candidate.audience !== "string" || candidate.audience.trim().length === 0) {
    throw new AuthError("auth/config", "JWT adapter config requires a non-empty string `audience`")
  }
  if (candidate.jwksUri !== undefined) {
    requireHttpUrl(candidate.jwksUri, "jwksUri")
  }
  if (candidate.jwksUri === undefined && candidate.jwks === undefined) {
    throw new AuthError(
      "auth/config",
      "JWT adapter config requires either `jwksUri` or a local `jwks`",
    )
  }
  if (candidate.fetch !== undefined && typeof candidate.fetch !== "function") {
    throw new AuthError("auth/config", "JWT adapter config `fetch` must be a function")
  }
  if (candidate.algorithms !== undefined) {
    if (
      !Array.isArray(candidate.algorithms) ||
      candidate.algorithms.length === 0 ||
      candidate.algorithms.some(
        (alg) => typeof alg !== "string" || alg.trim().length === 0 || alg.toLowerCase() === "none",
      )
    ) {
      throw new AuthError(
        "auth/config",
        "JWT adapter config `algorithms` must be a non-empty array of valid algorithms and cannot contain 'none'",
      )
    }
  }
  requirePositiveInteger(candidate.timeoutMs, "timeoutMs")
  if (
    candidate.cooldownDurationMs !== undefined &&
    (typeof candidate.cooldownDurationMs !== "number" ||
      !Number.isInteger(candidate.cooldownDurationMs) ||
      candidate.cooldownDurationMs < 0)
  ) {
    throw new AuthError(
      "auth/config",
      "JWT adapter config `cooldownDurationMs` must be a non-negative integer",
    )
  }
  requireJwks(candidate.jwks)
  requireOptionalNonEmptyString(candidate.headerName, "headerName")
  requireOptionalNonEmptyString(candidate.scheme, "scheme")
  requireOptionalNonEmptyString(candidate.subjectClaim, "subjectClaim")
  return config as JwtAdapterConfig
}

/** The accepted algorithms for a config, applying the secure default. */
export function jwtAlgorithms(config: JwtAdapterConfig): readonly string[] {
  return config.algorithms ?? DEFAULT_ALGORITHMS
}
