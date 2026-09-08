// Server-safe public entry for `@plainworks/auth` — the host-neutral core. Re-export-only barrel
// (no logic here; implementation lives in concern-named modules). No React or DOM imports, so the
// `.` entry runs anywhere (Node, edge, RSC, React Native). Token custody, OIDC exchange, and cookie
// minting arrive on the (server-quarantined) `./server` entry; React bindings on `./client`.
export type {
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
  LoginRedirect,
} from "./adapter"
export { CUSTOM_ADAPTER_KIND, createAdapterRegistry, customAdapter } from "./adapter"
export type { AuthCrypto } from "./crypto"
export { defaultAuthCrypto } from "./crypto"
export { mintCsrfToken, verifyCsrfToken } from "./csrf"
export type { AuthErrorCode } from "./errors"
export { AuthError } from "./errors"
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
  MemorySessionStoreConfig,
  SessionCodec,
  SessionCookieJar,
} from "./session-store"
export {
  createCookieSessionStore,
  createMemorySessionStore,
  decodeSession,
  encodeSession,
} from "./session-store"
export type { SessionSigner } from "./signer"
