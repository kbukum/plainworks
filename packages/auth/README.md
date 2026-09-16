# @plainworks/auth

> Pluggable authentication and authorization: host-neutral core, secure BFF default, swappable adapters.

Part of the [plainworks](../../README.md) kit.

## Install

```sh
bun add @plainworks/auth
```

## Usage

Compose a runtime from an adapter selection — an explicit factory, no module-level singletons:

```ts
import { createAuth } from "@plainworks/auth"

const auth = createAuth({
  adapter: { kind: "custom", adapter: myAdapter },
})

// Injected into any transport as the AuthHeaderProvider — the transport never imports auth.
const headers = await auth.getAuthHeader()
```

The in-memory session store custodies the access token (memory only — never `localStorage`), refreshes lazily and single-flight, and neutralizes a late refresh on logout.

## Runtime primitives

`@plainworks/auth`'s `.` entry is a **neutral** package touching no host globals, so it runs on every target runtime (Node, edge, RSC, React Native). The one non-universal primitive it needs — **Web Crypto** (`crypto.subtle` / `getRandomValues`, for PKCE and CSPRNG randomness) — is an injected seam (`AuthCrypto`) with a lazy platform default and a typed `auth/crypto-unavailable` error when a host lacks it. Cookie **minting**, the session-signing key, and the OIDC token exchange live on the server-quarantined `./server` entry, kept out of any `"use client"` graph. The React `useSession` hooks and login/logout navigation live on `./client` and carry only identity — never a token. See [`docs/architecture.md › Runtime primitives`](../../docs/architecture.md#runtime-primitives) for the primitive contract.

## Adapters and the login flow

Four adapters ship. Two are stateless verifiers on the neutral `.` entry — the **JWT bearer** adapter (`kind: "jwt"`, verifies an inbound token against the provider JWKS) and the **API-key** adapter (`kind: "apikey"`, validates a header key through your injected verifier; pair it with the exported `constantTimeEqual` for a timing-safe compare). The other two drive interactive or custom login — the **custom / bring-your-own** adapter (`kind: "custom"`) and the full **OIDC Authorization Code + PKCE** adapter (`kind: "oidc"`, discovers the provider, verifies the ID token, and custodies refresh tokens with rotation and reuse detection). `AuthAdapterConfig` is an open discriminated union, so a new adapter kind extends it without touching the core.

Register a stateless adapter into your injected registry, then select it by kind:

```ts
import { createAdapterRegistry, registerJwtAdapter, registerApiKeyAdapter } from "@plainworks/auth"
```

### Authorization

Beyond authentication, the package ships a default-deny authorization layer: `createAllowListPolicy` / `requireClaim` build a server `Authorizer`, `guardDecision` turns a decision into a typed outcome, and the `./client` gates (`createAuthGates` → `RequireAuth` / `Can`) render UX affordances. The gates are fail-closed presentation only — the real authorization boundary is enforced on the server.

On the server, `createServerSession` composes an interactive adapter, a `SessionSigner`, and the hardened cookie jar into the full BFF login flow — `beginLogin` / `completeLogin` / `logout` / `read` / `guard` — with session-bound signed CSRF and verify-before-parse session cookies. Pass a shared, app-scoped `RevocationRegistry` as `revocation` so a detected refresh-token reuse rejects the session cookie on its next read:

```ts
import { createServerSession, oidcAdapter, hmacSessionSigner } from "@plainworks/auth/server"
import { createRevocationRegistry } from "@plainworks/auth"
```

On the browser, `./client` exposes `createSessionContext` (a `SessionProvider` + `useSession` / `useIdentity` / `useIsAuthenticated`) and `login` / `logout` that bounce to the BFF routes. Tokens never cross into this graph — a dependency-cruiser boundary rule proves it.
