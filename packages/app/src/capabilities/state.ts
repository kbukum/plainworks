"use client"

// Opt-in recipe entry `@plainworks/app/capabilities/state` — publishes a **state scope registry**
// (the `StateSource`-shaped adapters an app builds scoped stores from: `memory`, `session`,
// `persistent`, `cookie`, `url`, the `query`-backed `remote`) to the subtree as an ordinary
// capability, so a scope registry is *not* a second kernel seam — it is one more entry in the
// single capability registry. `@plainworks/state` is an optional peer (a type-only import here) a
// consumer that publishes no scopes never loads. Pure React context (DOM-free) — it also runs on
// React Native/Expo.
import type { Scope } from "@plainworks/state"
import { createContext, createElement, useContext } from "react"
import { type ClientCapability, defineProvider } from "../client/capability"
import { AppContextError } from "../errors"

/**
 * The composed **state scope registry** — the `StateSource`-shaped adapters an app makes available
 * to build scoped stores from. Published by the capability so a subtree reads a scope by name
 * without importing it.
 */
export type AppScopes = Readonly<Record<string, Scope>>

/** Options for {@link createScopesCapability}. */
export interface ScopesCapabilityOptions {
  /** The scope registry to publish. The caller builds it per request — no module-level singleton. */
  readonly scopes: AppScopes
  /** The capability id — the `dependsOn` target; defaults to `"scopes"`. */
  readonly id?: string
  /** Ids this capability depends on; omit unless a scope adapter must mount inside another provider. */
  readonly dependsOn?: readonly string[]
}

/** The scopes recipe's output: the registry-ready capability plus the hook to read the registry. */
export interface ScopesCapability {
  /** Mount this in the capability registry to publish the scope registry to the subtree. */
  readonly capability: ClientCapability
  /** Read the composed {@link AppScopes} registry so a subtree can build scoped stores from it. */
  readonly useScopes: () => AppScopes
}

/**
 * Publish a state scope registry as a registry-ready capability — the canonical replacement for a
 * dedicated kernel `scopes` seam. Scope publication is just another provider, so the kernel keeps a
 * **single** extension point (capabilities) and never hard-depends on `@plainworks/state`; an app
 * that needs no scopes never loads this recipe. Its `useScopes` gives the subtree the composed
 * registry to build scoped stores from.
 */
export function createScopesCapability(options: ScopesCapabilityOptions): ScopesCapability {
  const { scopes, id = "scopes", dependsOn } = options
  const ScopesContext = createContext<AppScopes | null>(null)
  const capability = defineProvider({
    id,
    ...(dependsOn === undefined ? {} : { dependsOn }),
    provider: ({ children }) => createElement(ScopesContext.Provider, { value: scopes, children }),
  })
  return {
    capability,
    useScopes: () => {
      const value = useContext(ScopesContext)
      if (value === null) {
        throw new AppContextError("useScopes must be called inside its scopes capability.")
      }
      return value
    },
  }
}
