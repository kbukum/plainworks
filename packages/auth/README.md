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

The in-memory session store custodies the access token (memory only — never `localStorage`),
refreshes lazily and single-flight, and neutralizes a late refresh on logout.

## Runtime primitives

`@plainworks/auth`'s `.` entry is a **neutral** package touching no host globals, so it runs on every
target runtime (Node, edge, RSC, React Native). The one non-universal primitive it needs — **Web
Crypto** (`crypto.subtle` / `getRandomValues`, for PKCE and CSPRNG randomness) — is an injected seam
({@link AuthCrypto}) with a lazy platform default and a typed `auth/crypto-unavailable` error when a
host lacks it. Token custody, OIDC exchange, and cookie minting arrive on the server-quarantined
`./server` entry; React bindings on `./client`. See
[`docs/architecture.md › Axis 2`](../../docs/architecture.md) for the primitive contract.
