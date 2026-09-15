import type { WebFetch } from "@plainworks/std"
import { AuthError } from "../../errors"
import type { SessionSigner } from "../../signer/seam"

/** The registry kind under which the OIDC Authorization Code + PKCE adapter registers. */
export const OIDC_ADAPTER_KIND = "oidc"

/** A server-side per-session store for custodying refresh tokens keyed by an opaque session handle. */
export interface SessionTokenStore {
  get(sessionId: string): string | undefined | Promise<string | undefined>
  set(sessionId: string, refreshToken: string): void | Promise<void>
  delete(sessionId: string): void | Promise<void>
}

/**
 * Config for the OIDC Authorization Code + PKCE (S256) adapter. Selecting `{ kind: "oidc", ... }`
 * wires a full OpenID Connect login through a maintained standards stack (`oauth4webapi` for the
 * OAuth2/OIDC dance, `jose` for JWKS-backed token verification) behind the existing adapter seam —
 * no bespoke protocol. Implicit flow is dead; only Authorization Code + PKCE is offered.
 */
export interface OidcAdapterConfig {
  readonly kind: typeof OIDC_ADAPTER_KIND
  /** The OpenID Provider issuer URL — discovery reads `{issuer}/.well-known/openid-configuration`. */
  readonly issuer: string
  /** The registered client identifier (a public client using PKCE, no client secret). */
  readonly clientId: string
  /** The registered redirect URI the provider returns the authorization code to. */
  readonly redirectUri: string
  /** Requested scopes; defaults to `["openid", "profile", "email"]`. `openid` is always included. */
  readonly scopes?: readonly string[]
  /**
   * The signer that integrity-protects the login transaction (PKCE verifier / state / nonce) across
   * the round trip so a tampered transaction is rejected. The server-owned session signer by
   * default — a seam here, never the concrete key, so the adapter stays in the neutral graph.
   */
  readonly signer: SessionSigner
  /**
   * The `fetch` seam for provider discovery, JWKS retrieval, and the token endpoint. Defaults to
   * the host's global `fetch`. Injected (like `@plainworks/http`'s `options.fetch`) so a test
   * drives a mock provider and a host binds its own transport.
   */
  readonly fetch?: WebFetch
  /**
   * Accepted JWS `alg` values for the ID token and any verified access token. Defaults to
   * `["RS256", "ES256"]`. `none` can never appear here, so an unsigned token is always rejected.
   */
  readonly idTokenSigningAlgs?: readonly string[]
  /** How long a login transaction stays valid, in seconds; defaults to 600 (10 minutes). */
  readonly transactionTtlSeconds?: number
  /** Maximum time in milliseconds for remote provider requests; defaults to 10_000. */
  readonly timeoutMs?: number
  /** Cooldown duration between remote JWKS refreshes on unknown kid in milliseconds; defaults to 5_000. */
  readonly cooldownDurationMs?: number
  /** Server-side per-session store custodying refresh tokens; defaults to an in-memory store. */
  readonly tokenStore?: SessionTokenStore
  /**
   * Additional allowed origins for endpoints discovered from the provider (e.g. `jwks_uri`,
   * `token_endpoint`, `authorization_endpoint`). By default, endpoints must share the issuer's
   * origin to protect against SSRF via provider discovery.
   */
  readonly allowedOrigins?: readonly string[]
}

/** Validate and narrow unknown input to {@link OidcAdapterConfig}. */
export function validateOidcAdapterConfig(config: unknown): OidcAdapterConfig {
  if (typeof config !== "object" || config === null) {
    throw new AuthError("auth/config", "OIDC adapter config must be a non-null object")
  }
  const candidate = config as Record<string, unknown>
  if (candidate.kind !== OIDC_ADAPTER_KIND) {
    throw new AuthError("auth/config", `OIDC adapter config kind must be "${OIDC_ADAPTER_KIND}"`)
  }
  if (typeof candidate.issuer !== "string" || candidate.issuer.trim().length === 0) {
    throw new AuthError("auth/config", "OIDC adapter config requires a non-empty string `issuer`")
  }
  try {
    const url = new URL(candidate.issuer)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error()
    }
  } catch {
    throw new AuthError(
      "auth/config",
      `OIDC adapter config issuer "${String(candidate.issuer)}" must be a valid http(s) URL`,
    )
  }
  if (typeof candidate.clientId !== "string" || candidate.clientId.trim().length === 0) {
    throw new AuthError("auth/config", "OIDC adapter config requires a non-empty string `clientId`")
  }
  if (typeof candidate.redirectUri !== "string" || candidate.redirectUri.trim().length === 0) {
    throw new AuthError(
      "auth/config",
      "OIDC adapter config requires a non-empty string `redirectUri`",
    )
  }
  try {
    new URL(candidate.redirectUri)
  } catch {
    throw new AuthError(
      "auth/config",
      `OIDC adapter config redirectUri "${String(candidate.redirectUri)}" must be a valid URL`,
    )
  }
  const signer = candidate.signer
  if (
    typeof signer !== "object" ||
    signer === null ||
    typeof (signer as { sign?: unknown }).sign !== "function" ||
    typeof (signer as { verify?: unknown }).verify !== "function"
  ) {
    throw new AuthError(
      "auth/config",
      "OIDC adapter config requires a `signer` with `sign` and `verify` functions",
    )
  }
  if (candidate.scopes !== undefined) {
    if (
      !Array.isArray(candidate.scopes) ||
      candidate.scopes.some((s) => typeof s !== "string" || s.trim().length === 0)
    ) {
      throw new AuthError(
        "auth/config",
        "OIDC adapter config `scopes` must be an array of non-empty strings",
      )
    }
  }
  if (candidate.idTokenSigningAlgs !== undefined) {
    if (
      !Array.isArray(candidate.idTokenSigningAlgs) ||
      candidate.idTokenSigningAlgs.length === 0 ||
      candidate.idTokenSigningAlgs.some(
        (alg) => typeof alg !== "string" || alg.trim().length === 0 || alg.toLowerCase() === "none",
      )
    ) {
      throw new AuthError(
        "auth/config",
        "OIDC adapter config `idTokenSigningAlgs` must be a non-empty array of valid algorithms and cannot contain 'none'",
      )
    }
  }
  if (candidate.transactionTtlSeconds !== undefined) {
    if (
      typeof candidate.transactionTtlSeconds !== "number" ||
      !Number.isFinite(candidate.transactionTtlSeconds) ||
      candidate.transactionTtlSeconds <= 0
    ) {
      throw new AuthError(
        "auth/config",
        "OIDC adapter config `transactionTtlSeconds` must be a positive finite number",
      )
    }
  }
  if (candidate.fetch !== undefined && typeof candidate.fetch !== "function") {
    throw new AuthError("auth/config", "OIDC adapter config `fetch` must be a function")
  }
  if (candidate.timeoutMs !== undefined) {
    if (
      typeof candidate.timeoutMs !== "number" ||
      !Number.isFinite(candidate.timeoutMs) ||
      candidate.timeoutMs <= 0
    ) {
      throw new AuthError(
        "auth/config",
        "OIDC adapter config `timeoutMs` must be a positive finite number",
      )
    }
  }
  if (candidate.cooldownDurationMs !== undefined) {
    if (
      typeof candidate.cooldownDurationMs !== "number" ||
      !Number.isFinite(candidate.cooldownDurationMs) ||
      candidate.cooldownDurationMs < 0
    ) {
      throw new AuthError(
        "auth/config",
        "OIDC adapter config `cooldownDurationMs` must be a non-negative finite number",
      )
    }
  }
  const tokenStore = candidate.tokenStore
  if (tokenStore !== undefined) {
    if (
      typeof tokenStore !== "object" ||
      tokenStore === null ||
      typeof (tokenStore as { get?: unknown }).get !== "function" ||
      typeof (tokenStore as { set?: unknown }).set !== "function" ||
      typeof (tokenStore as { delete?: unknown }).delete !== "function"
    ) {
      throw new AuthError(
        "auth/config",
        "OIDC adapter config `tokenStore` must provide get, set, and delete methods",
      )
    }
  }
  if (candidate.allowedOrigins !== undefined) {
    if (
      !Array.isArray(candidate.allowedOrigins) ||
      candidate.allowedOrigins.some((origin) => {
        if (typeof origin !== "string" || origin.trim().length === 0) {
          return true
        }
        try {
          const u = new URL(origin)
          return u.protocol !== "http:" && u.protocol !== "https:"
        } catch {
          return true
        }
      })
    ) {
      throw new AuthError(
        "auth/config",
        "OIDC adapter config `allowedOrigins` must be an array of valid http(s) origin strings",
      )
    }
  }
  return config as OidcAdapterConfig
}
