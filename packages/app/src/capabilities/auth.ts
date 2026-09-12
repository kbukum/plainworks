"use client"

// Opt-in recipe entry `@plainworks/app/capabilities/auth` — thin, ejectable glue that turns
// `@plainworks/auth`'s session store into a registry-ready capability. It is a **per-recipe
// subpath** on purpose: `@plainworks/auth` is an optional peer (a type-only import here) that a
// query-only consumer never loads, so the à-la-carte kernel stays dependency-free. Pure React
// context (DOM-free) — it also runs on React Native/Expo.
import type { SessionSnapshot } from "@plainworks/auth"
import type { Store } from "@plainworks/state"
import { createSuppliedStoreContext } from "@plainworks/state/client/supplied"
import { createElement } from "react"
import { type ClientCapability, defineProvider } from "../client/capability"

/** Options for {@link createAuthCapability}. */
export interface AuthCapabilityOptions {
  /**
   * The auth session's client-safe snapshot store — `AuthStore.store` from `@plainworks/auth`'s
   * `createAuthStore`. It publishes identity/status only (never the token), and the recipe adopts
   * it as-is; the caller builds it per request, so custody stays SSR-safe with no singleton.
   */
  readonly store: Store<SessionSnapshot>
  /** The capability id — the snapshot key and the `dependsOn` target; defaults to `"auth"`. */
  readonly id?: string
  /**
   * Ids this capability depends on — e.g. `["query"]` when the session's refresh is driven through
   * the shared query cache, so `auth` mounts inside it. Omit when the session store is standalone.
   */
  readonly dependsOn?: readonly string[]
}

/** The auth recipe's output: the registry-ready capability plus the hook to read the session. */
export interface AuthCapability {
  /** Mount this in the capability registry to publish the session to the subtree. */
  readonly capability: ClientCapability
  /**
   * Read the client-safe {@link SessionSnapshot} below the capability — the whole snapshot, or a
   * reference-stable slice via a selector (identity, status). Backed by `@plainworks/state`'s
   * `useSyncExternalStore` binding, so a slice re-renders only when the session actually changes
   * (a login or logout on the underlying store).
   */
  readonly useSession: {
    (): SessionSnapshot
    <Slice>(selector: (session: SessionSnapshot) => Slice): Slice
  }
}

/**
 * Publish an auth session as a registry-ready capability — thin glue that bridges
 * `@plainworks/auth`'s snapshot `store` to React through `@plainworks/state`'s **published**
 * bring-your-own-store binding (`createSuppliedStoreContext`). No new binding is invented in `app`:
 * eject it by calling `createSuppliedStoreContext<SessionSnapshot>()` over the same store yourself
 * and you lose only this convenience. Its `useSession` gives the subtree the **client-reactive**
 * identity and status — never the token, which `auth` custodies server-side — and re-renders on a
 * later login or logout.
 *
 * **Scope — client session, not a zero-flash SSR resolver.** This recipe has no server `resolve`:
 * `createAuthStore`'s snapshot store always *initializes* unauthenticated (identity is established
 * by a token exchange, not seeded), so on a real server render it emits the pre-login default. It
 * is the right binding for a **client/SPA** session (the in-memory-token fallback) — reactive to
 * login/logout — but an app that needs server-resolved *no-auth-flash* SSR must resolve identity on
 * the server and hydrate it through the kernel's snapshot contract (a capability with a `resolve`
 * that seeds its provider from the `resolved` prop), which awaits `@plainworks/auth`'s own
 * server-side session binding. Bridging that here would mean `app` inventing auth's SSR binding —
 * the cage the layering forbids.
 */
export function createAuthCapability(options: AuthCapabilityOptions): AuthCapability {
  const { store, id = "auth", dependsOn } = options
  const { Provider, useStore } = createSuppliedStoreContext<SessionSnapshot>()
  const capability = defineProvider({
    id,
    ...(dependsOn === undefined ? {} : { dependsOn }),
    provider: ({ children }) => createElement(Provider, { store, children }),
  })
  return { capability, useSession: useStore }
}
