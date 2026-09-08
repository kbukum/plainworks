---
"@plainworks/auth": patch
"@plainworks/std": patch
"@plainworks/state": patch
---

Add `@plainworks/auth` (L3) — the pluggable authentication + authorization layer, with a host-neutral core that composes what the kit already owns (`state` store model, `std` seams and resilience) rather than inventing parallels.

Step 1 lands the host-neutral foundation:

- **`std` seams (seams live low)** — `Identity` (the resolved caller: `subject` + app-owned `claims`), the `Authorizer` decision seam (`(identity, action, resource) => Decision`, **default-deny by contract**), and the host-neutral `RedirectSignal`. A future `@plainworks/authz` can implement these without importing `auth`.
- **In-memory session core** — `createAuthStore` custodies the access token **in memory only**, backs its client-safe snapshot (identity + status) on `state`'s `createStore`, tracks expiry against an injected `Clock`, and de-duplicates concurrent refreshes (single-flight). It satisfies the `AuthHeaderProvider` seam via `getAuthHeader`, which degrades to `undefined` (never throws) so a transport owns the 401.
  - **A1 fix** — logout bumps a generation and **aborts** the in-flight refresh, so a refresh resolving after logout is dropped: the session stays cleared and no session-change fires.
  - **A2 fix** — the refresh is bounded by a deadline (`std` `withTimeout`); even a refresh that ignores its signal is abandoned, single-flight is released, and the next call retries.
- **Adapter registry** — an explicit, injected `AuthRegistry` (`register`/`create`), first-registration-wins default (gokit parity), duplicate/unknown rejected with a typed error, plus the open `AuthAdapter` interface and a `custom` pass-through. `createAuth({...})` is the per-request composition factory — no import-time side effects, no module-level singletons.
- **Crypto seam** — an injected `AuthCrypto` (`digestSha256` for PKCE `S256`, `randomBytes` CSPRNG) with a Web Crypto default resolved lazily and a typed `auth/crypto-unavailable` error when a host lacks it. The `std` seeded RNG never reaches these paths.
- **Typed errors** — an `AuthError` code family over `std` `PlainError`.

Step 2 lands session custody as a secure specialization of the `state` `StateSource` seam, plus the token-custody import boundary:

- **`session-store/cookie` (default, server-side)** — `createCookieSessionStore` is a `StateSource` over a request's cookie jar that writes a `__Host-`-prefixed, `Secure` + `HttpOnly` + `SameSite=Strict` + `Path=/` (no `Domain`) cookie. Reads run **verify-at-read** (`decodeSession`): the integrity MAC is checked **before** the payload is parsed, expiry is absolute, and the value is validated against a `StandardSchemaV1` — a tampered/unsigned/malformed cookie throws `auth/session-invalid`, an expired one `auth/session-expired`, and an over-budget value `auth/config`; a caller is never handed a fabricated session.
- **`session-store/memory` (TMB fallback)** — `createMemorySessionStore` reuses `state`'s neutral `memory` scope and its **secret guard**, so the in-memory access token can live *only* in a memory-equivalent scope; a non-memory scope is rejected with `StateConfigError`.
- **Signing seam** — a `SessionSigner` seam with `hmacSessionSigner` (HMAC-SHA256, constant-time verify) exported from the quarantined **`@plainworks/auth/server`** entry; the codec and cookie store that consume it stay host-neutral.
- **CSRF** — `mintCsrfToken`/`verifyCsrfToken` for the double-submit pattern (CSPRNG token, constant-time check), defense-in-depth on top of `SameSite=Strict`.
- **Import boundary** — a dependency-cruiser rule (`no-client-into-auth-server`) plus the export map keep the server-only custody graph out of any `"use client"` bundle, with a fixture-backed fail-closed test and a portability fixture proving `./server` compiles host-free.

`@plainworks/std` also gains the neutral RFC 6265 **cookie grammar** (`isCookieNameToken`, `isCookiePath`, `serializeCookieAttributes`, `MAX_COOKIE_BYTES`, `utf8ByteLength`) and a `WebTextEncoder` bound as the universal shim's `TextEncoder`, so the client cookie scope and the server `__Host-` session cookie share one grammar. `@plainworks/state` consumes that grammar (no local copies) and relocates its capability **secret guard** to the neutral `scope/` concern (no behavior change) so `auth`'s TMB fallback reuses the same enforcement path.
