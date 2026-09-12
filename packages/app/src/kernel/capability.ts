import type { WebAbortSignal, WebHeaders } from "@plainworks/std"

/** A value the composition layer accepts either synchronously or as a promise. */
export type Awaitable<T> = T | Promise<T>

/**
 * The server-side input a capability's {@link Capability.resolve} reads to compute its pre-paint
 * value. Host-neutral by construction: it carries only the incoming request's {@link WebHeaders}
 * (universal shim primitive) — from which a theme reads its cookie, a session its session cookie —
 * plus an optional {@link WebAbortSignal} so a resolver that reaches the network abandons its work
 * when the request is torn down. A host adapter builds this from its own request object; the
 * neutral kernel never assumes a Node/DOM request.
 */
export interface CapabilityResolveContext {
  /** The incoming request's headers — the one host-neutral source a resolver reads (cookies, etc.). */
  readonly headers: WebHeaders
  /** Cancels an in-flight resolver when the request is abandoned; a synchronous resolver ignores it. */
  readonly signal?: WebAbortSignal
}

/**
 * The **neutral (server) half** of a capability — its identity and optional server resolver, and
 * nothing else. It is React-free by construction, so it lives in the `.` entry: a host builds this
 * registry and runs {@link import("./snapshot").resolveCapabilities} on any runtime (Node, edge,
 * workers, RSC) *without* importing the `"use client"` provider graph. Its client counterpart — the
 * provider component — is authored separately as a
 * {@link import("../client/capability").ClientCapability}, and the two are joined by `id`. That
 * split is what keeps server/token-custody code out of the client bundle by construction, not by
 * convention.
 *
 * @typeParam Resolved - the serializable value this capability's resolver emits (JSON-serializable:
 *   it crosses the server→client boundary in the snapshot).
 */
export interface Capability<Resolved = unknown> {
  /**
   * Stable, unique identity — the key its resolved value is stored under in the snapshot, and the
   * id its client provider joins to.
   */
  readonly id: string
  /**
   * Optional server resolver for capabilities with server-resolvable state (theme, session, scoped
   * values). Run during SSR by {@link import("./snapshot").resolveCapabilities}; its output is
   * serialized into the snapshot so the first paint is already correct without a client round-trip.
   * Must return a JSON-serializable value. Resolvers are independent and run concurrently, so a
   * capability declares no ordering here — mount ordering is a provider concern that lives on the
   * client half's `dependsOn`.
   */
  readonly resolve?: (ctx: CapabilityResolveContext) => Awaitable<Resolved>
}

/** A capability whose resolved type the kernel does not need to name. */
export type AnyCapability = Capability<unknown>

/**
 * Author the **neutral half** of a capability — the canonical idiom for the server resolver, safe
 * to place in a neutral (non-`"use client"`) module a host can call during SSR. It infers and
 * checks the resolver's `Resolved` output within the neutral graph. The separately authored client
 * provider receives the deserialized slice as `unknown` and must narrow it because a shared string
 * id cannot prove that both halves agree. Omit `resolve` for a client-only capability (its provider
 * needs no server slice) — such a capability has only a client half.
 */
export function defineCapability<Resolved>(spec: Capability<Resolved>): Capability<Resolved> {
  return spec
}
