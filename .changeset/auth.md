---
"@plainworks/auth": minor
"@plainworks/std": patch
"@plainworks/state": patch
"@plainworks/testkit": patch
---

Add `@plainworks/auth`, the pluggable authentication and authorization layer. Its core runs anywhere and builds on what the kit already has — the state store and the shared seams — rather than reinventing them.

- **Seams live low** — the identity shape, the authorization decision seam (default-deny), and the redirect signal live in `@plainworks/std`, so a future authorization package can implement them without depending on auth.
- **In-memory session** — the access token is kept in memory only. The session tracks its own expiry and collapses concurrent refreshes into one. Logging out cancels any in-flight refresh so a late response can't revive a cleared session, and a refresh that ignores its deadline is abandoned so the next attempt can proceed.
- **Adapters** — auth mechanisms register explicitly through an injected registry, with the first one becoming the default and duplicates rejected. You compose an auth instance with a factory, one per request, with no shared global. Two adapters ship: the **custom / bring-your-own** adapter and a full **OIDC Authorization Code + PKCE** adapter that discovers the provider, verifies the ID-token signature, and custodies its tokens in memory.
- **Server login flow** — the server-only `./server` entry assembles an interactive adapter, a session signer, and the hardened cookie jar into `createServerSession` — `beginLogin` / `completeLogin` / `logout` / `read` / `guard` — with session-bound signed CSRF, keyset-rotating signatures, and verify-before-parse session cookies that reject tampered, expired, or revoked state.
- **Client entry** — the `./client` React entry ships `createSessionContext` (a `SessionProvider` with `useSession` / `useIdentity` / `useIsAuthenticated`) and `login` / `logout` navigation that bounce to the BFF routes. It is DOM-free (so React Native can use it) and carries only identity — never a token.
- **Crypto** — an injectable crypto seam (for PKCE and secure randomness) with a Web Crypto default and a clear error when a host lacks it.
- **Secure session storage** — the default stores the session in a hardened, signed, HttpOnly cookie that is verified before it's parsed, so a tampered or expired cookie is rejected rather than trusted. The signing key, the OIDC token exchange, and cookie minting live behind a server-only import that can never be pulled into a browser bundle — enforced by a boundary rule, not just convention. CSRF helpers round out the defenses.

`@plainworks/std` gains a shared cookie grammar and text encoder, and `@plainworks/state` reuses that grammar and relocates its secret guard so auth's session store enforces the same rule. No behavior change to state.

`@plainworks/testkit` adds a deterministic in-process OpenID Provider double (`createMockIdp`) that mints real, JWKS-verifiable tokens with `jose`, so an OIDC adapter runs its genuine discovery, PKCE, nonce, and token-verification path with only the network faked — no MSW and no real sockets. It drives the failure paths too: forced token-exchange failure, replayed codes, nonce mismatch, and PKCE verifier mismatch.
