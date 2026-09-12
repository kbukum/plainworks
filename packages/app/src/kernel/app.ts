import type { AnyCapability, CapabilityResolveContext } from "./capability"
import { assertUniqueIds } from "./ordering"
import { type AppSnapshot, resolveCapabilities } from "./snapshot"

/** Configuration for {@link createApp}. */
export interface AppConfig {
  /**
   * The capability registry's **neutral half** — the server-resolvable capabilities, each an
   * identity plus an optional resolver. The single extension seam: adding a concern is adding a
   * registry entry, never editing the kernel. Ids must be unique (a duplicate is a typed config
   * error); order is irrelevant because resolvers run concurrently. Defaults to none.
   */
  readonly capabilities?: readonly AnyCapability[]
}

/**
 * The composed app value — the host-neutral output of the composition kernel. It holds the neutral
 * capability registry and runs the SSR resolvers. The React tree is one *rendering* of a resolved
 * snapshot (via `AppProvider`); an RSC/streaming host is another. It carries no React and touches
 * no provider, so it runs anywhere the resolvers do.
 */
export interface App {
  /** The neutral capability registry (identity + optional resolver). */
  readonly capabilities: readonly AnyCapability[]
  /**
   * Run every capability's server resolver against the request `context` and return the
   * serializable {@link AppSnapshot} — the resolve half of the zero-flash SSR contract. A host
   * serializes the result into the initial markup and hands it back to `AppProvider` to hydrate
   * from. Resolvers run concurrently, each bounded by `context.signal`.
   */
  resolve(context: CapabilityResolveContext): Promise<AppSnapshot>
}

/**
 * Build an {@link App} from injected capabilities — the canonical composition idiom, the one place
 * the à-la-carte concern packages' server halves are wired into a whole. It is a **per-request
 * factory**: pure, with no import-time side effects and no module-level singleton, so two
 * concurrent SSR requests each get an isolated app that never bleeds state into the other.
 * Nothing is reached from a global — every capability is passed in. The matching client provider
 * registry is authored separately (the `"use client"` half) and handed to `AppProvider`; the two
 * are joined by `id`.
 */
export function createApp(config: AppConfig = {}): App {
  const capabilities = config.capabilities ?? []
  assertUniqueIds(capabilities)
  return {
    capabilities,
    resolve: (context) => resolveCapabilities(capabilities, context),
  }
}
