import type { AuthHeaders, Clock, Identity, WebAbortSignal } from "@plainworks/std"
import type { AuthCrypto } from "../crypto"
import type { TokenSet } from "../session"

/**
 * Shared services an adapter is handed at construction — injected, never reached for as globals, so
 * an adapter has no import-time side effects and is deterministic under test.
 */
export interface AuthAdapterDeps {
  /** CSPRNG + SHA-256 for PKCE and per-request `state`/`nonce`. */
  readonly crypto: AuthCrypto
  /** Time source for expiry/lifetime math. */
  readonly clock: Clock
}

/** A request to resolve an {@link Identity} from inbound credentials (a bearer token, API key, cookie). */
export interface AuthenticateRequest {
  /** Inbound request headers carrying the credential (header-only — never a URL/query string). */
  readonly headers?: AuthHeaders
  /** Cancellation for any remote verification the adapter performs. */
  readonly signal?: WebAbortSignal
}

/** A request to begin an interactive login (e.g. OIDC Authorization Code). */
export interface BeginLoginRequest {
  /** Where to return the user after login — sanitized to same-origin/relative by the caller. */
  readonly returnTo?: string
  readonly signal?: WebAbortSignal
}

/** The instruction to start an interactive login — where to send the user agent and what to persist. */
export interface LoginRedirect {
  /** The provider authorization URL to redirect the user agent to. */
  readonly authorizationUrl: string
  /** Opaque, integrity-protected transaction state to persist until the callback (PKCE/state/nonce). */
  readonly transaction: string
}

/** A request to complete an interactive login from the provider's redirect back. */
export interface CompleteLoginRequest {
  /** The raw callback parameters returned by the provider (`code`, `state`, `iss`, ...). */
  readonly params: Readonly<Record<string, string>>
  /** The transaction persisted by {@link LoginRedirect}. */
  readonly transaction: string
  readonly signal?: WebAbortSignal
}

/** The result of a completed login — the resolved caller plus the credential material to custody. */
export interface AuthSession {
  readonly identity: Identity
  readonly tokens: TokenSet
}

/**
 * The open extension point for an authentication mechanism. Built-ins (`oidc`, `jwt`, `apikey`) and a
 * bring-your-own adapter satisfy the same interface, so a consumer swaps mechanisms without touching
 * the core. `id` names the mechanism; `authenticate` is the one required capability (resolve an
 * identity from a request); the interactive/session methods are optional so a stateless verifier
 * (JWT/API key) implements only what it needs.
 */
export interface AuthAdapter {
  /** Stable identifier for the mechanism (`"oidc"`, `"jwt"`, a custom name). */
  readonly id: string
  /** Optional one-time async setup (discovery, key warmup) — never runs at import time. */
  init?(deps: AuthAdapterDeps): void | Promise<void>
  /** Resolve the caller from a request's credentials, or `null` when unauthenticated. */
  authenticate(request: AuthenticateRequest): Promise<Identity | null>
  /** Start an interactive login (redirect-based flows). */
  beginLogin?(request: BeginLoginRequest): Promise<LoginRedirect>
  /** Complete an interactive login from the provider callback. */
  completeLogin?(request: CompleteLoginRequest): Promise<AuthSession>
  /** Obtain a fresh token set (refresh-token rotation lives in the adapter). */
  refresh?(signal: WebAbortSignal): Promise<TokenSet>
  /** Tear down provider/RP session state on logout, where the mechanism supports it. */
  logout?(signal?: WebAbortSignal): Promise<void>
}

/**
 * Config for the trivial pass-through adapter — a supplied {@link AuthAdapter} handed straight to the
 * runtime. It exists so a bring-your-own adapter needs no registered factory, and so the registry
 * itself is testable without a real mechanism. Built-in variants (`oidc`, `jwt`, `apikey`) extend
 * this union in their own steps.
 */
export interface CustomAdapterConfig {
  readonly kind: "custom"
  readonly adapter: AuthAdapter
}

/**
 * The discriminated-union selection of an adapter. Open by design: each built-in adds its own member
 * (`{ kind: "oidc"; ... }`, etc.) as it lands, and `custom` covers bring-your-own — so selecting a
 * mechanism is config-driven with no core change.
 */
export type AuthAdapterConfig = CustomAdapterConfig
