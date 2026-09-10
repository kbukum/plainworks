"use client"

import type { ComponentType, ReactNode } from "react"

/**
 * Props every capability provider component receives from the
 * {@link import("./provider").AppProvider}: its own untrusted server-resolved slice plus the
 * subtree to wrap. The slice stays `unknown` because the neutral resolver and client provider are
 * authored separately and joined only by a runtime string id; the provider must narrow it before
 * use. Hydrating from a narrowed `resolved` value on the **first** render — not in a mount effect —
 * is what makes the zero-flash contract real: the client's first paint matches the server's.
 */
export interface CapabilityProviderProps {
  /** This capability's untrusted snapshot slice, or `undefined` when unresolved. */
  readonly resolved: unknown
  /** The subtree this capability wraps. */
  readonly children: ReactNode
}

/** The React component a capability contributes — a provider over {@link CapabilityProviderProps}. */
export type CapabilityComponent = ComponentType<CapabilityProviderProps>

/**
 * A typed capability **client half**: the provider component that renders a capability's slice,
 * plus the `id` that joins it to its
 * {@link import("../kernel/capability").Capability neutral resolver} and the ids it mounts inside.
 * This is the `"use client"` counterpart to the neutral half — a host builds this registry inside a
 * client boundary and hands it to `AppProvider`, so server/token code never enters the client
 * bundle.
 */
export interface CapabilityProvider {
  /** Stable, unique identity — the snapshot key its `resolved` slice is read from. */
  readonly id: string
  /**
   * The ids this capability depends on — each mounts **outermost** (wrapping this one) so this
   * provider can consume it. `dependsOn` lives here, on the provider half, because ordering is a
   * provider-nesting concern; {@link import("./provider").AppProvider} topologically sorts by it.
   * A missing or cyclic id is a typed config error, caught before render.
   */
  readonly dependsOn?: readonly string[]
  /** The provider component, which narrows its untrusted resolved slice before use. */
  readonly provider: CapabilityComponent
}

/** A capability provider as it lives in the heterogeneous client registry. */
export type ClientCapability = CapabilityProvider

/**
 * Define a capability's **client half** — the canonical authoring idiom for its provider.
 * Its `resolved` prop remains `unknown` until the provider validates or narrows it: a shared string
 * id cannot prove that independently authored server and client halves agree, and the serialized
 * snapshot is a trust boundary. Join it to its server resolver, authored neutrally with
 * {@link import("../kernel/capability").defineCapability}, by using the same `id`.
 */
export function defineProvider(spec: CapabilityProvider): ClientCapability {
  return spec
}
