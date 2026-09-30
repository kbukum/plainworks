import { isRecord } from "@plainworks/std"
import { raceAbort } from "@plainworks/std/resilience"
import { AppConfigError } from "../errors"
import type { AnyCapability, CapabilityResolveContext } from "./capability"

/**
 * The server-resolved state of an app, keyed by capability id — the payload of the zero-flash SSR
 * contract. A capability's {@link import("./capability").Capability.resolve} output lands under its
 * id; a host serializes this once on the server, emits it into the initial markup, and the client
 * binding hydrates each capability from its own slice so the first paint is already correct with no
 * client round-trip. Every value is JSON-serializable by contract (it crosses the wire).
 */
export interface AppSnapshot {
  /** Resolved value per capability id; a capability with no resolver contributes no entry. */
  readonly capabilities: Readonly<Record<string, unknown>>
}

/** An empty snapshot — the starting point for an app with no server-resolvable capabilities. */
export const EMPTY_SNAPSHOT: AppSnapshot = { capabilities: {} }

/**
 * Run every capability's server resolver and collect the results into an {@link AppSnapshot} — the
 * **resolve** half of the SSR contract. Resolvers run concurrently (they are independent, and one
 * may await the network); each is **bounded** by the caller's
 * {@link CapabilityResolveContext.signal} via {@link raceAbort}, so an already-aborted request runs
 * no resolver body and a stalled or non-cooperative resolver rejects when the request is torn down
 * instead of leaving `app.resolve` pending forever (the signal is still passed to the resolver so
 * it can also cancel its own in-flight work). A capability without a `resolve` simply contributes
 * no entry. The kernel never touches a capability's provider here, so this stays host-neutral and
 * React-free.
 */
export async function resolveCapabilities(
  capabilities: readonly AnyCapability[],
  context: CapabilityResolveContext,
): Promise<AppSnapshot> {
  const resolved = await Promise.all(
    capabilities.map(async (capability) => {
      const { resolve } = capability
      if (resolve === undefined) {
        return undefined
      }
      // An already-aborted request runs no resolver body: on abort we hand `raceAbort` a harmless
      // resolved promise so `resolve` is never invoked, and it rejects with the abort reason.
      // When live, the resolver runs and is raced against the signal so a stalled or
      // non-cooperative one rejects on tear-down instead of hanging (the signal is still passed for
      // its own cancellation).
      const pending = context.signal?.aborted
        ? Promise.resolve(undefined)
        : Promise.resolve(resolve(context))
      return [capability.id, await raceAbort(pending, context.signal)] as const
    }),
  )
  const entries = resolved.filter(
    (entry): entry is readonly [string, unknown] => entry !== undefined,
  )
  return { capabilities: Object.fromEntries(entries) }
}

/**
 * Narrow an untrusted value to an {@link AppSnapshot}. The snapshot crosses the server→client
 * wire, so the reader validates its shape and raises a typed {@link AppConfigError} rather than
 * returning a fabricated snapshot. Each slice stays `unknown` for its provider to narrow.
 */
export function parseSnapshot(value: unknown): AppSnapshot {
  if (!isRecord(value) || !isRecord(value.capabilities)) {
    throw new AppConfigError("Malformed app snapshot: expected a { capabilities } object.")
  }
  return { capabilities: value.capabilities }
}

/**
 * Read one capability's untrusted resolved slice from a snapshot. Only an **own** property counts,
 * so an absent id yields `undefined` rather than an inherited `Object.prototype` member
 * (`toString`, `constructor`). The value crossed an untrusted wire and remains `unknown` until the
 * receiving provider validates or narrows it.
 */
export function snapshotFor(snapshot: AppSnapshot, id: string): unknown {
  return Object.hasOwn(snapshot.capabilities, id) ? snapshot.capabilities[id] : undefined
}
