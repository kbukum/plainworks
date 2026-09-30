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

Every entry is **neutral** except `./client` (React, DOM-free) and `./form-post` (browser): they touch no host globals, so they run on Node, edge, RSC, and React Native. The one non-universal primitive auth needs, **Web Crypto**, is an injected seam (`AuthCrypto`) with a lazy platform default and a typed `auth/crypto-unavailable` error when a host lacks it. See [`docs/architecture.md › Runtime primitives`](../../docs/architecture.md#runtime-primitives) for the primitive contract.

| Entry | What it gives you |
|---|---|
| `.` | `createAuth` and the typed `AuthError` family. |
| `./adapter` | The adapter registry and the JWT, API-key, and custom adapters. |
| `./authz` | Default-deny authorization policies and decisions. |
| `./crypto` | The `AuthCrypto` seam, its Web Crypto default, and `constantTimeEqual`. |
| `./csrf` | Session-bound CSRF tokens. |
| `./redirect` | `sanitizeReturnTo`, `guardSession`, and the unauthenticated-redirect signal. |
| `./session` | The reactive auth store and session snapshots. |
| `./session-store` | The signed cookie session store, its envelope codec, and the revocation registry. |
| `./signer` | The `SessionSigner` seam. |
| `./server` | Server-only: cookie sessions, the OIDC adapter, the HMAC signer, and the BFF route helpers. Never import it from a `"use client"` module. |
| `./client` | React session hooks, auth gates, and `login`/`logout`. Identity only, never a token. |
| `./form-post` | The browser navigator `login`/`logout` drive. |

## Adapters and the login flow

Four adapters ship. Two are stateless verifiers on `./adapter` — the **JWT bearer** adapter (`kind: "jwt"`, verifies an inbound token against the provider JWKS) and the **API-key** adapter (`kind: "apikey"`, validates a header key through your injected verifier; pair it with the exported `constantTimeEqual` for a timing-safe compare). The other two drive interactive or custom login — the **custom / bring-your-own** adapter (`kind: "custom"`) and the full **OIDC Authorization Code + PKCE** adapter (`kind: "oidc"`, discovers the provider, verifies the ID token, and custodies refresh tokens with rotation and reuse detection). `AuthAdapterConfig` is an open discriminated union, so a new adapter kind extends it without touching the core.

Register a stateless adapter into your injected registry, then select it by kind:

```ts
import { createAdapterRegistry, registerApiKeyAdapter, registerJwtAdapter } from "@plainworks/auth/adapter"
```

### Authorization

Beyond authentication, the package ships a default-deny authorization layer: `createAllowListPolicy` / `requireClaim` build a server `Authorizer`, `guardDecision` turns a decision into a typed outcome, and the `./client` gates (`createAuthGates` → `RequireAuth` / `Can`) render UX affordances. The gates are fail-closed presentation only — the real authorization boundary is enforced on the server.

On the server, `createServerSession` composes an interactive adapter, a `SessionSigner`, and the hardened cookie jar into the full BFF login flow — `beginLogin` / `completeLogin` / `logout` / `read` / `guard` — with session-bound signed CSRF and verify-before-parse session cookies. Pass a shared, app-scoped `RevocationRegistry` as `revocation` so a detected refresh-token reuse rejects the session cookie on its next read:

```ts
import { createServerSession, oidcAdapter, hmacSessionSigner } from "@plainworks/auth/server"
import { createRevocationRegistry } from "@plainworks/auth/session-store"
```

### BFF route helpers

`./server` also ships small helpers for the BFF routes, over Web `Request`/`Response`, so any server framework can use them. They keep the risky parts safe by default:

| Helper | What it does |
|---|---|
| `createRequestJar(request)` | Reads the request's cookies and collects every cookie the session flow sets. |
| `redirectToPath({ origin, path, cookies })` | `303` to a sanitized same-origin path. A caller's `returnTo` can never become an open redirect. |
| `redirectToUrl(url, cookies)` | `303` to a trusted absolute URL, such as the provider's authorization URL. |
| `isSameOriginRequest(request, origin)` | Checks `Sec-Fetch-Site`, then `Origin`, then `Referer`. Denies a request with none of them. |
| `parseAppOrigin(value)` | Validates your configured app origin. Never read it from `X-Forwarded-Host`. |
| `resolveSigningKey({ configured, allowEphemeral })` | Rejects a key under 32 bytes. Mints a random key only when you allow it, never in production. |
| `readFormBody(request)` | Reads a form body with a 16 KiB cap. Throws `PayloadTooLargeError`, which you answer with `413`. |

A logout route checks the sender, reads the capped form, verifies CSRF, then redirects with the cleared cookies:

```ts
import { createRequestJar, isSameOriginRequest, readFormBody, redirectToPath } from "@plainworks/auth/server"

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request, origin)) return new Response(null, { status: 403 })
  const { jar, cookies } = createRequestJar(request)
  const form = await readFormBody(request)
  if (!(await session.verifyCsrf(jar, form.get("csrf") ?? ""))) return new Response(null, { status: 403 })
  await session.logout(jar)
  return redirectToPath({ origin, path: "/", cookies })
}
```

On the browser, `./client` exposes `createSessionContext` (a `SessionProvider` + `useSession` / `useIdentity` / `useIsAuthenticated`) and `login` / `logout` that bounce to the BFF routes. Tokens never cross into this graph — a dependency-cruiser boundary rule proves it.

`login` and `logout` take an injected `AuthNavigator`, so `./client` stays DOM-free and runs on React Native too. In a browser, pass `formPostNavigator`: it navigates with `location.assign`, logs out with a hidden-form POST, and reads the CSRF token from the `__Host-csrf` cookie. Use `createFormPostNavigator({ csrfCookieName })` when the server issues the cookie under another name.

```tsx
import { login, logout } from "@plainworks/auth/client"
import { formPostNavigator } from "@plainworks/auth/form-post"

login({ navigator: formPostNavigator, returnTo: "/tasks" })
logout({ navigator: formPostNavigator })
```
