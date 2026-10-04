---
"@plainworks/auth": minor
---

Complete the auth hardening with refresh-token rotation and automatic reuse detection (OAuth 2.0 Security BCP, RFC 9700), and expose a revocation bridge for it.

- **Refresh-token rotation with reuse detection** — the OIDC refresh-token store holds one live refresh token per session handle and rotates it whenever the provider returns a replacement. Any other token presented for that handle — a superseded one the legitimate client already rotated past, or an unknown one — is treated as a replay: it purges the whole session family, denies the refresh with `auth/session-revoked`, and signals compromise through the new `onReuseDetected` hook. A provider that itself rejects a refresh with `invalid_grant` is treated the same way. Token comparison is constant-time.
- **Opaque family revocation** — `createServerSession` uses injected `OpaqueSessionStore` persistence for authoritative lookup, atomic replacement and family revocation. Provider refresh remains server-only; reuse detection revokes the browser session family. The bounded memory default retains tombstones through expiry plus the transaction retention window, never evicts live sessions, and explicitly rejects capacity exhaustion. Distributed hosts implement the same transactional contract.

Session-bound CSRF uses header-only proof. Signers protect server OIDC transactions and CSRF, not browser identity cookies. `RefreshTokenStore` and `createRefreshTokenStore` own provider credentials exclusively on the server.
