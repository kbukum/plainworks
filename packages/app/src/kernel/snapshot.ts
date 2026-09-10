import { isRecord, raceAbort } from "@plainworks/std"
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

// Characters that are inert inside a JSON string but hostile when that JSON is embedded in an HTML
// `<script>` block: `<` (and thus `</script>`) can terminate the element, and U+2028/U+2029 are raw
// line terminators that break a JavaScript string literal. Escaping them to their `\uXXXX` form
// keeps the payload a valid, identical JSON value while making it safe to inline.
const HTML_UNSAFE = /[<>&\u2028\u2029]/g
const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
}

// `JSON.stringify` treats a resolver's contract violations as success: it silently drops an
// `undefined`/function/symbol property (turning a resolved capability into an absent client slice)
// and throws a *native* `TypeError` on a `BigInt` or a circular value, bypassing the typed error
// API. This replacer intercepts every non-JSON value and raises a typed `AppConfigError` instead,
// so serialization either round-trips faithfully or fails loudly with an actionable message.
function rejectNonJson(_key: string, value: unknown): unknown {
  const type = typeof value
  if (type === "undefined" || type === "function" || type === "symbol" || type === "bigint") {
    throw new AppConfigError(
      `Could not serialize the app snapshot: a resolved value of type "${type}" is not JSON-serializable.`,
    )
  }
  return value
}

/**
 * Serialize a snapshot for transport, safe to inline in server-rendered markup — the **serialize**
 * half of the contract. A resolver returning a non-JSON value (a function, `undefined`, a `BigInt`,
 * a circular reference) violates its contract, so serialization fails with a typed
 * {@link AppConfigError} rather than silently dropping the value or leaking a native `TypeError`.
 * The result escapes the HTML-hostile characters so an embedded `</script>` in a resolved value
 * cannot break out of the script element (an XSS vector).
 */
export function serializeSnapshot(snapshot: AppSnapshot): string {
  let json: string | undefined
  try {
    json = JSON.stringify(snapshot, rejectNonJson)
  } catch (cause) {
    if (cause instanceof AppConfigError) {
      throw cause
    }
    throw new AppConfigError(
      "Could not serialize the app snapshot: a resolved value is not JSON.",
      {
        cause,
      },
    )
  }
  if (json === undefined) {
    throw new AppConfigError("Could not serialize the app snapshot: a resolved value is not JSON.")
  }
  return json.replace(HTML_UNSAFE, (char) => HTML_ESCAPES[char] ?? char)
}

/**
 * Parse a serialized snapshot back on the client — the **hydrate** half. Runs at a trust boundary
 * over server-emitted markup, so it validates the shape and raises a typed
 * {@link AppConfigError} on malformed input rather than returning a fabricated snapshot.
 */
export function deserializeSnapshot(raw: string): AppSnapshot {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (cause) {
    throw new AppConfigError("Could not parse the app snapshot: malformed JSON.", { cause })
  }
  if (!isRecord(parsed) || !isRecord(parsed.capabilities)) {
    throw new AppConfigError("Malformed app snapshot: expected a { capabilities } object.")
  }
  return { capabilities: parsed.capabilities }
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
