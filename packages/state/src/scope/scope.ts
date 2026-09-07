import type {
  StandardSchemaV1,
  StateCapabilities,
  StateSerializer,
  StateSource,
} from "@plainworks/std"

/**
 * Everything a {@link Scope} needs to build a backend for one value slot: the `key` naming the slot
 * within the scope's medium, the `serializer` that encodes/decodes the value for a string medium
 * (Web Storage, a cookie, a URL param), and an optional `schema` that validates a decoded value at
 * the read boundary. An in-memory scope holds the live reference and ignores the serializer and
 * schema; passing them anyway keeps `createSource` uniform across every scope.
 */
export interface SourceSpec<Value> {
  /** Stable key identifying this value slot within the scope. */
  readonly key: string
  /** Encode/decode for a string-backed medium; ignored by in-memory scopes. */
  readonly serializer: StateSerializer<Value>
  /**
   * Optional Standard Schema validator. Persisted media (Web Storage, a cookie, the URL) are
   * **untrusted** — anyone can tamper with them — so a string-backed source runs this over the
   * decoded value before adopting it, turning a wrong-shaped value into a typed error rather than a
   * fabricated `Value`. Omit it only when the medium is trusted (in-memory) or the caller has made an
   * explicit trust decision.
   */
  readonly schema?: StandardSchemaV1<unknown, Value>
}

/**
 * A **scope**: the factory that builds a per-slot {@link StateSource} backend for one storage medium
 * — `memory`, `session`, `persistent`, `cookie`, `url`, and (later, from the query layer) `remote`.
 * It is the axis the scoped-state surface is parameterized by: moving a value between scopes is a
 * one-line `scope:` change, because the surface only ever talks to this factory.
 *
 * Selection is **config-driven and explicit** — a caller passes the scope object in, so there is no
 * global registry or string service-locator. Host access is deferred to {@link Scope.createSource}
 * (invoked per request inside the surface's Provider), so importing a scope reads no storage and
 * touches no host at module load.
 */
export interface Scope {
  /** Human-readable scope name (`"memory"`, `"persistent"`, …) — for diagnostics, not dispatch. */
  readonly name: string
  /**
   * The **static** capabilities every source this scope builds carries — known without a host, so a
   * composer can read them at construction (the secret guard reads `durable`/`sentToServer`/… here to
   * reject a secret placed in a non-memory scope) instead of waiting for a per-request source. A
   * built {@link StateSource} reports the same capabilities.
   */
  readonly capabilities: StateCapabilities
  /** Build the backend for one value slot. Called per request; performs no host access until used. */
  createSource<Value>(spec: SourceSpec<Value>): StateSource<Value>
}
