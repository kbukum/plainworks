"use client"

import { createElement, type ReactNode } from "react"
import { orderCapabilities } from "../kernel/ordering"
import { type AppSnapshot, EMPTY_SNAPSHOT, snapshotFor } from "../kernel/snapshot"
import type { ClientCapability } from "./capability"
import { AppContextProvider } from "./context"

/** Props for {@link AppProvider}. */
export interface AppProviderProps {
  /**
   * The capability registry's **client half** — the provider components to mount, each joined to a
   * server slice by `id`. Authored inside a client boundary (never handed the server's resolve-only
   * `App`, which cannot cross an RSC boundary), so nothing but the serializable `snapshot` crosses
   * from the server. `AppProvider` topologically sorts them by `dependsOn`, so registration order
   * does not matter.
   */
  readonly capabilities: readonly ClientCapability[]
  /**
   * The server-resolved snapshot to hydrate from. Pass what the server produced (via
   * `app.resolve(...)` then serialize/deserialize) so each capability's first client render matches
   * the server — the zero-flash contract. Omit for a client-only app (capabilities start
   * unresolved).
   */
  readonly snapshot?: AppSnapshot
  readonly children: ReactNode
}

/**
 * The headless composition root. It orders the injected client capability registry by `dependsOn`
 * and renders it into a React tree — mounting each capability's provider **outermost→innermost**
 * and handing it its resolved snapshot slice — under an app context that publishes the per-request
 * snapshot. It is **headless**: it wires whatever capabilities are injected and imports no
 * `@plainworks/ui` — and, equally, no `@plainworks/query`. A shared query client is not
 * special-cased here; mount it as a capability with `createQueryCapability` (the opt-in
 * `./capabilities` recipe), so the same root serves a batteries-included showcase and a bare app
 * while the core binding stays free of every concern package.
 */
export function AppProvider({
  capabilities,
  snapshot = EMPTY_SNAPSHOT,
  children,
}: AppProviderProps): ReactNode {
  return createElement(AppContextProvider, {
    snapshot,
    children: composeCapabilityProviders(orderCapabilities(capabilities), snapshot, children),
  })
}

/**
 * Nest an ordered capability registry into a provider tree. The registry is already sorted
 * outermost→innermost, so folding from the right makes index 0 the outermost wrapper; each provider
 * receives its own resolved slice looked up by capability id. No provider is special-cased — the
 * order is data, which is what keeps the composition open/closed.
 */
export function composeCapabilityProviders(
  capabilities: readonly ClientCapability[],
  snapshot: AppSnapshot,
  children: ReactNode,
): ReactNode {
  return capabilities.reduceRight<ReactNode>(
    (acc, capability) =>
      createElement(capability.provider, {
        resolved: snapshotFor(snapshot, capability.id),
        children: acc,
      }),
    children,
  )
}
