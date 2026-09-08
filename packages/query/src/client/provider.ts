"use client"

import {
  environmentManager,
  HydrationBoundary,
  type QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"
import { createElement, type ReactNode } from "react"

/**
 * Detect whether the current runtime should build a fresh client per call (server/SSR) or reuse one
 * (browser). TanStack's `environmentManager` treats any runtime without `window` as a server, which
 * is correct for SSR but wrong for React Native/Expo. Hosts on RN/Expo should call
 * `environmentManager.setIsServer(() => false)` once at startup to override the detection.
 */
export function isServerRuntime(): boolean {
  return environmentManager.isServer()
}

/** Props for {@link QueryProvider}. */
export interface QueryProviderProps {
  /**
   * The client to provide. **Required** — the host owns client creation. On the server, build one
   * client per request and pass it here so one user's cache never leaks into another. In the
   * browser, build one client at startup and pass it to every render. On React Native/Expo,
   * **also** call `environmentManager.setIsServer(() => false)` once at startup — passing a client
   * does not change TanStack's no-window-means-server detection.
   */
  readonly client: QueryClient
  readonly children: ReactNode
}

/**
 * The kit's `"use client"` TanStack provider — a thin wrapper over `QueryClientProvider` that
 * provides the host-supplied client. Pure React context (no DOM), so it runs on the browser and
 * React Native alike. Mount it once near the root; read the cache below it with the TanStack hooks
 * (or a transport's own hooks, e.g. connect-query).
 */
export function QueryProvider({ client, children }: QueryProviderProps): ReactNode {
  return createElement(QueryClientProvider, { client }, children)
}

// Re-export TanStack's `HydrationBoundary` so an RSC host rehydrates a server-dehydrated cache with
// the same import surface it gets the provider from — no second dependency on
// `@tanstack/react-query`.
export { HydrationBoundary }
