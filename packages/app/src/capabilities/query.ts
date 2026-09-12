"use client"

// Opt-in recipe entry `@plainworks/app/capabilities/query` — thin, ejectable glue that turns
// `@plainworks/query` into a registry-ready capability. It is a **per-recipe subpath** on purpose:
// `@plainworks/query` is an optional peer, so importing this module (and only this module) is what
// pulls that peer in. An auth-only consumer never loads it, so the à-la-carte kernel stays
// dependency-free. Pure React context (DOM-free) — it also runs on React Native/Expo.
import { QueryProvider } from "@plainworks/query/client"
import type { QueryClient } from "@tanstack/query-core"
import { createElement } from "react"
import { type ClientCapability, defineProvider } from "../client/capability"

/** Options for {@link createQueryCapability}. */
export interface QueryCapabilityOptions {
  /**
   * The request-scoped TanStack `QueryClient` to mount. The caller owns its lifetime (one per
   * request on the server, one at startup in the browser) — the recipe never creates one, so it
   * stays a per-request factory with no module-level singleton.
   */
  readonly client: QueryClient
  /** The capability id other capabilities target with `dependsOn`; defaults to `"query"`. */
  readonly id?: string
  /** Ids this capability itself depends on (rarely needed for query — it usually sits outermost). */
  readonly dependsOn?: readonly string[]
}

/**
 * Turn a caller-owned `QueryClient` into a registry-ready capability — the thin glue that lets a
 * data capability like `auth` declare `dependsOn: ["query"]` and be mounted **inside** the shared
 * cache deterministically, instead of relying on `AppProvider`'s always-outermost `queryClient`
 * prop. It is a one-line wrapper over `@plainworks/query`'s published `QueryProvider`: eject it by
 * mounting `QueryProvider` yourself and you lose only this convenience, never a capability.
 */
export function createQueryCapability(options: QueryCapabilityOptions): ClientCapability {
  const { client, id = "query", dependsOn } = options
  return defineProvider({
    id,
    ...(dependsOn === undefined ? {} : { dependsOn }),
    provider: ({ children }) => createElement(QueryProvider, { client, children }),
  })
}
