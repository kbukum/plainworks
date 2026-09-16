---
"@plainworks/auth": patch
---

Add two stateless verifier adapters beside `oidc` and `custom`, both opt-in through the existing `createAdapterRegistry` seam, for direct-token backends (the BFF session cookie stays the primary topology).

- **`jwt`** — verifies an inbound bearer token against the provider JWKS with Web Crypto (via `jose`): a pinned algorithm allowlist that can never include `alg: none`, a bounded and cancellable JWKS fetch behind an injected `fetch` seam (defaulted at call time, never import time), and validated config (JWKS shape, header name, scheme, subject claim) at construction. Verification failures are classified so an outage never masquerades as a 401 — a bad credential (signature, claims, expiry, disallowed algorithm, unknown key) resolves to `null` via the new `auth/token-invalid` code, while a JWKS timeout, transport failure, or malformed key document propagates as `auth/adapter`. The shared JWKS verifier now lives in its own `jwt/verify` module, reused by both adapters.
- **`apikey`** — extracts a key **header-only** (never a URL/query string) and delegates validation to an injected bring-your-own verifier that owns key custody. An unknown key denies; a verifier fault propagates rather than collapsing into a silent deny. The exported `constantTimeEqual` is available for a BYO verifier's key comparison.

Both custody nothing, so they ship from the neutral `.` entry via `registerJwtAdapter` / `registerApiKeyAdapter`.
