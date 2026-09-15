// Server-only entry for `@plainworks/auth` — the token-bearing surface. Everything here either
// holds a server secret (the session-signing key), custodies OAuth tokens (the OIDC adapter's
// in-memory access/refresh tokens), or assembles the two into the full login flow, so this entry
// **must never** be imported from a `"use client"` module: a dependency-cruiser boundary rule and
// the package export map enforce that. Re-export-only barrel; implementation lives in `server/` and
// `adapter/oidc/` concern modules. Host-neutral TS (no React/DOM), but quarantined from any client
// graph.
export { oidcAdapter, registerOidcAdapter } from "./adapter/oidc"
export type { MemoryTokenStoreOptions } from "./adapter/oidc/token-store"
export { createMemoryTokenStore } from "./adapter/oidc/token-store"
export type { HmacSignerConfig } from "./server/hmac-signer"
export { hmacSessionSigner } from "./server/hmac-signer"
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
