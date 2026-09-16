// Server-safe public entry for `@plainworks/auth` — the host-neutral core. Re-export-only barrel
// (no logic here; implementation lives in concern-named modules). No React or DOM imports, so the
// `.` entry runs anywhere (Node, edge, RSC, React Native). The pieces that hold a secret — the
// session-signing key, the OIDC token exchange and its refresh-token custody, and the assembled
// `createServerSession` flow — live on the (server-quarantined) `./server` entry. The React
// `useSession`/login/logout bindings live on `./client`, and never touch a token.
export type {
  ApiKeyAdapterConfig,
  ApiKeyVerifier,
  AuthAdapter,
  AuthAdapterConfig,
  AuthAdapterDeps,
  AuthAdapterFactory,
  AuthenticateRequest,
  AuthRegistry,
  AuthSession,
  BeginLoginRequest,
  CompleteLoginRequest,
  CustomAdapterConfig,
  InteractiveAuthAdapter,
  JwtAdapterConfig,
  JwtVerifier,
  JwtVerifierConfig,
  LoginRedirect,
  OidcAdapterConfig,
  VerifiedClaims,
} from "./adapter"
export {
  APIKEY_ADAPTER_KIND,
  apiKeyAdapter,
  CUSTOM_ADAPTER_KIND,
  createAdapterRegistry,
  createJwtVerifier,
  customAdapter,
  JWT_ADAPTER_KIND,
  jwtAdapter,
  OIDC_ADAPTER_KIND,
  registerApiKeyAdapter,
  registerJwtAdapter,
  validateApiKeyAdapterConfig,
  validateJwtAdapterConfig,
} from "./adapter"
export type { AllowListPolicyConfig, AllowRule, AuthzGuardConfig, AuthzOutcome } from "./authz"
export { createAllowListPolicy, guardDecision, requireClaim } from "./authz"
export type { AuthCrypto } from "./crypto"
export { constantTimeEqual, defaultAuthCrypto } from "./crypto"
export type { CsrfConfig, CsrfProtection } from "./csrf"
export { createCsrf } from "./csrf"
export type { AuthErrorCode } from "./errors"
export { AuthError } from "./errors"
export type { AuthGuardConfig } from "./redirect"
export { guardSession, sanitizeReturnTo, unauthenticatedRedirect } from "./redirect"
export type { AuthRuntime, CreateAuthConfig } from "./runtime"
export { createAuth } from "./runtime"
export type {
  AuthStore,
  AuthStoreConfig,
  RefreshFn,
  SessionSnapshot,
  TokenSet,
} from "./session"
export { createAuthStore } from "./session"
export type {
  CookieSessionStoreConfig,
  RevocationCheck,
  RevocationRegistry,
  RevocationRegistryOptions,
  SessionCodec,
  SessionCookieJar,
  SessionEnvelope,
} from "./session-store"
export {
  createCookieSessionStore,
  createRevocationRegistry,
  decodeSession,
  encodeSession,
} from "./session-store"
export type { SessionSigner } from "./signer"
