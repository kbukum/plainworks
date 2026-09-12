# @plainworks/app

> Composition kernel: wire the plainworks concern packages into a working app through an injected capability registry, host-neutral, no singletons.

Part of the [plainworks](../../README.md) kit.

## Install

```sh
bun add @plainworks/app
```

## Usage

`@plainworks/app` is the **composition kernel** — the one place the plainworks concern packages are wired into a working whole. It composes through an **injected capability registry**, so nothing is a battery baked into core: an app is whatever capabilities you pass in (a theme, a session, a `channel` status, `auth`, telemetry — each an injected capability, not a hard dependency of core).

Build the per-request app value with `createApp` — a factory, no module-level singleton. A capability has **two halves joined by an `id`**: a **neutral server resolver** authored with `defineCapability` (from `@plainworks/app`, React-free, safe on any runtime) and a **client provider** authored with `defineProvider` (from `@plainworks/app/client`). Keeping them in separate modules is what lets a server run the resolvers without pulling the `"use client"` provider graph into its bundle — the split that makes RSC and token-custody safety structural, not a convention. Because a string id cannot prove that separately authored halves agree, the provider receives its deserialized slice as `unknown` and validates or narrows it before use. Providers mount in **declared-dependency order** (a topological sort), not array position — a provider names the ids it `dependsOn` and is mounted inside them; a missing or cyclic id is a typed `AppConfigError` before any render.

```ts
// theme.ts — the neutral half: a server resolver, no React, runs anywhere (Node, edge, RSC).
import { defineCapability } from "@plainworks/app"

export const themeResolver = defineCapability<{ className: "dark" | "light" }>({
  id: "theme",
  // Output is serialized into the snapshot for a zero-flash first paint.
  resolve: ({ headers }) => ({
    className: headers.get("cookie")?.includes("theme=dark") ? "dark" : "light",
  }),
})
```

```tsx
// theme.client.tsx — the client half: the provider, joined to the resolver by the same id.
"use client"
import { AppConfigError } from "@plainworks/app"
import { defineProvider } from "@plainworks/app/client"
import { createElement } from "react"

function readTheme(value: unknown): "dark" | "light" | undefined {
  if (value === undefined) return undefined
  if (
    typeof value !== "object" ||
    value === null ||
    !("className" in value) ||
    (value.className !== "dark" && value.className !== "light")
  ) {
    throw new AppConfigError("Malformed theme snapshot.")
  }
  return value.className
}

export const themeProvider = defineProvider({
  id: "theme",
  provider: ({ resolved, children }) => {
    const className = readTheme(resolved) ?? "light"
    return createElement("div", { className }, children)
  },
})
```

State **scopes** are not a kernel seam — capabilities are the single extension point, so a scope registry is published as one more capability with the `@plainworks/app/capabilities/state` recipe (see recipes below), never a `scopes` option on `createApp`.

**Zero-flash SSR** is a plain-data contract on the neutral `.` entry — resolve on the server (only the neutral halves are needed there), serialize into the markup, hydrate on the client so each capability's first client render matches the server:

```ts
import { createApp, serializeSnapshot } from "@plainworks/app"

const app = createApp({ capabilities: [themeResolver] })
const snapshot = await app.resolve({ headers: request.headers })
const initialState = serializeSnapshot(snapshot)
```

The React binding lives on the `"use client"` `./client` entry. `AppProvider` is a **headless** composition root: it orders the injected provider halves by `dependsOn`, mounts each outermost→innermost, and imports no `@plainworks/ui` — and no `@plainworks/query`. A shared query client is not special-cased; mount it as a capability with `createQueryCapability` (see recipes below).

The server never hands its resolve-only `App` across an RSC boundary — only the serialized **snapshot string** crosses. Render on the server, emit `initialState` into the markup, then mount the **provider halves** (imported in the client boundary) and hydrate from that string:

```tsx
"use client"
import { AppProvider } from "@plainworks/app/client"
import { deserializeSnapshot } from "@plainworks/app"
import { themeProvider } from "./theme.client"

// The provider halves are imported here in the client boundary; `initialState` is the string the
// server emitted from `serializeSnapshot`.
<AppProvider capabilities={[themeProvider]} snapshot={deserializeSnapshot(initialState)}>
  <Routes />
</AppProvider>
```

Read the composed snapshot from the subtree with `useAppSnapshot`, catch render failures with `AppErrorBoundary` (injected fallback + report seam), and author more capabilities with `defineCapability` (neutral) + `defineProvider` (client).

### Testing

The shipped harness renders a subtree inside the real providers — pass the **provider halves** (and an optional snapshot); no hand-rolled test wiring:

```tsx
import { renderWithProviders } from "@plainworks/app/testing"

renderWithProviders(<Dashboard />, { capabilities: [themeProvider] })
```

## Three tiers — opinionated, never binding

The kit is usable at three levels; each higher tier is convenience built on the same public seams you could wire by hand. The easy path is the right path, but you are never trapped.

| Tier | What you use | When |
| --- | --- | --- |
| **1 — primitives** | each package alone (`state`, `query`, `auth`, `channel`) with its own provider + hooks | no `app` needed |
| **2 — kernel** | `createApp` + the injected capability registry | you want one place to compose concerns |
| **3 — recipes** | opt-in factories on `@plainworks/app/capabilities/*` | "state + query + auth together" in a line or two |

### Recipes (`@plainworks/app/capabilities/*`)

Recipes are **thin, ejectable glue** over each core package's published binding — each turns a package into a registry-ready **provider half** that declares its own `dependsOn`. Each recipe is its **own subpath** so it pulls in only its owner: `@plainworks/auth` and `@plainworks/query` are optional peers, so an auth-only app imports `@plainworks/app/capabilities/auth` and never loads query (and vice versa):

```tsx
import { createQueryCapability } from "@plainworks/app/capabilities/query"
import { createAuthCapability } from "@plainworks/app/capabilities/auth"

const query = createQueryCapability({ client: queryClient })
// `auth` mounts inside the shared cache — declared, not by mount order.
const { capability: auth, useSession } = createAuthCapability({
  store: authStore.store,
  dependsOn: ["query"],
})

// Provider halves mount under AppProvider; ordered by dependency, not authoring order.
<AppProvider capabilities={[auth, query]}>
  <Routes />
</AppProvider>
```

**Ejectability is the contract.** A recipe only ever composes the owning package's public binding — `createQueryCapability` wraps `@plainworks/query`'s `QueryProvider`, `createAuthCapability` bridges `@plainworks/auth`'s session store through `@plainworks/state`'s `createSuppliedStoreContext`, and `createScopesCapability` (`@plainworks/app/capabilities/state`) publishes a `@plainworks/state` scope registry — the canonical replacement for a dedicated kernel `scopes` seam, so scopes stay one more capability, not a second extension point. Delete `app`, wire those same bindings by hand, and you lose only convenience, never a capability. The recipe surface is `ui`-free — `ui`-backed batteries (a themed toggle, a toast host) live in the showcase, not here.

> **`createAuthCapability` publishes a client session** (reactive to login/logout — the SPA/in-memory-token path), not a server-resolved one. Auth's snapshot store always initializes unauthenticated, so on a real server render it emits the pre-login default. For server-resolved **no-auth-flash** SSR, resolve identity on the server and hydrate it through a capability's `resolve` + `resolved` prop (the kernel's zero-flash contract) — that awaits `@plainworks/auth`'s own server-side session binding.


## Runtime primitives

`@plainworks/app` is a **neutral (`.`)** package touching no host globals, so it runs on every target runtime. The neutral half uses only **universal** WHATWG value types directly — `Headers` (the resolve context's request headers) and `AbortSignal` (snapshot resolution is bounded by a caller-owned signal via `@plainworks/std`'s `raceAbort`). It binds **no non-universal seam** of its own: `fetch`, storage, and crypto belong to the concern packages a capability wraps, never to the kernel. The `./client` bindings are DOM-free (the **React-without-DOM** bucket), so they also run on React Native/Expo. See [`docs/architecture.md › Axis 2`](../../docs/architecture.md) for the primitive contract and the three entry buckets.
