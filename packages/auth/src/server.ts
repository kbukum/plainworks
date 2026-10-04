// Server-only entry for `@plainworks/auth` — the token-bearing surface. Everything here either
// holds a server secret (the transaction and CSRF signing key), custodies OAuth tokens (the OIDC
// adapter's in-memory access/refresh tokens), or assembles the two into the full login flow, so
// this entry **must never** be imported from a `"use client"` module: a dependency-cruiser boundary
// rule and the package export map enforce that. Re-export-only barrel; implementation lives in
// `server/` and `adapter/oidc/` concern modules. Host-neutral TS (no React/DOM), but quarantined
// from any client graph.
export { oidcAdapter, registerOidcAdapter } from "./adapter/oidc"
export type {
  RefreshRotation,
  RefreshTokenStore,
  RefreshTokenStoreOptions,
} from "./adapter/oidc/refresh-store"
export {
  createRefreshTokenStore,
  validateRefreshHandle,
  validateRefreshToken,
} from "./adapter/oidc/refresh-store"
export type { ProviderTokens } from "./adapter/seam"
export type {
  ReadFormBodyOptions,
  RedirectToPathOptions,
  RequestJar,
} from "./server/bff"
export {
  authFailureResponse,
  createRequestJar,
  DEFAULT_FORM_BODY_BYTES,
  isSameOriginRequest,
  parseAppOrigin,
  readFormBody,
  redirectToPath,
  redirectToUrl,
} from "./server/bff"
export type { HmacSignerConfig } from "./server/hmac-signer"
export { hmacSessionSigner } from "./server/hmac-signer"
export type {
  MemorySessionStoreOptions,
  OpaqueSessionStore,
  StoredLogin,
  StoredSession,
} from "./server/opaque-store"
export {
  createMemorySessionStore,
  decodeLoginRecord,
  decodeSessionMetadata,
  decodeSessionRecord,
  encodeSessionRecord,
} from "./server/opaque-store"
export type {
  ServerBeginLoginRequest,
  ServerBeginLoginResult,
  ServerCompleteLoginRequest,
  ServerCompleteLoginResult,
  ServerSession,
  ServerSessionConfig,
  ServerSessionJar,
} from "./server/server-session"
export { createServerSession } from "./server/server-session"
