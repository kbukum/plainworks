---
"@plainworks/auth": patch
"@plainworks/std": patch
"@plainworks/state": patch
---

Add `@plainworks/auth`, the pluggable authentication and authorization layer. Its core runs anywhere and builds on what the kit already has — the state store and the shared seams — rather than reinventing them.

- **Seams live low** — the identity shape, the authorization decision seam (default-deny), and the redirect signal live in `@plainworks/std`, so a future authorization package can implement them without depending on auth.
- **In-memory session** — the access token is kept in memory only. The session tracks its own expiry and collapses concurrent refreshes into one. Logging out cancels any in-flight refresh so a late response can't revive a cleared session, and a refresh that ignores its deadline is abandoned so the next attempt can proceed.
- **Adapters** — auth mechanisms register explicitly through an injected registry, with the first one becoming the default and duplicates rejected. You compose an auth instance with a factory, one per request, with no shared global.
- **Crypto** — an injectable crypto seam (for PKCE and secure randomness) with a Web Crypto default and a clear error when a host lacks it.
- **Secure session storage** — the default stores the session in a hardened, signed, HttpOnly cookie that is verified before it's parsed, so a tampered or expired cookie is rejected rather than trusted. A memory fallback keeps the token out of any durable storage. The signing key and cookie signing live behind a server-only import that can never be pulled into a browser bundle — enforced by a boundary rule, not just convention. CSRF helpers round out the defenses.

`@plainworks/std` gains a shared cookie grammar and text encoder, and `@plainworks/state` reuses that grammar and relocates its secret guard so auth's memory fallback enforces the same rule. No behavior change to state.
