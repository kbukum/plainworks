import { PlainError } from "@plainworks/std"

/**
 * The machine-readable discriminants for every failure `@plainworks/auth` raises. One flat code
 * family (mirroring `@plainworks/state`'s error style) so a caller can branch exhaustively on
 * `error.kind` without catching by class.
 */
export type AuthErrorCode =
  /** No credential resolved a caller — the request is unauthenticated. */
  | "auth/unauthenticated"
  /** A token refresh failed, timed out, or was rejected by the provider. */
  | "auth/refresh-failed"
  /** Invalid or missing auth configuration, detected before any request runs. */
  | "auth/config"
  /** The runtime exposes no Web Crypto (`crypto.subtle`/`getRandomValues`) for the secure paths. */
  | "auth/crypto-unavailable"
  /** An adapter could not resolve, verify, or complete an authentication step. */
  | "auth/adapter"
  /** A persisted session cookie failed integrity/signature/shape verification at read — treat as unauthenticated, never fabricate a session. */
  | "auth/session-invalid"
  /** A validly-signed session cookie is past its absolute lifetime — the caller must re-authenticate. */
  | "auth/session-expired"
  /** An anti-CSRF token was missing, malformed, or did not match on a state-changing request. */
  | "auth/csrf"

/**
 * Typed error raised by `@plainworks/auth`. Extends the kit's {@link PlainError} so the whole graph
 * shares one shape — a machine-readable `kind` discriminant and a preserved `cause`. Never throw a
 * string; throw (or reject with) an `AuthError`.
 */
export class AuthError extends PlainError<AuthErrorCode> {}
