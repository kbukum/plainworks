import type {
  StandardSchemaV1,
  StateCapabilities,
  StateSerializer,
  StateSource,
} from "@plainworks/std"

/**
 * A persisted value's **schema-evolution** story: the current integer `version` a write stamps, and
 * a `migrate` that upgrades a value read at an older version to the current shape. Without it a
 * shape change silently discards persisted state; with it an old payload is upgraded, not dropped.
 *
 * A pre-versioning payload (persisted before `versioning` was added) is read as **version 0**, so
 * `migrate(oldValue, 0)` is the upgrade path from unversioned state. A value stamped with a version
 * **newer** than the current one, or a `migrate` that throws, is a typed error at the read boundary
 * — a value from an unknown future is never fabricated into the current shape.
 */
export interface PersistedVersioning<Value> {
  /** The current schema version a write stamps; a positive integer (a pre-versioning read is `0`). */
  readonly version: number
  /**
   * Upgrade a value decoded at `oldVersion` (`< version`) to the current shape. Receives the
   * decoded old value as `unknown` — its shape predates the current type — so narrow it before
   * returning the current `Value`. Throw to reject an unmigratable value rather than fabricate one.
   */
  readonly migrate: (oldValue: unknown, oldVersion: number) => Value
}

/**
 * Everything a {@link Scope} needs to build a backend for one value slot: the `key` naming the slot
 * within the scope's medium, the `serializer` that encodes/decodes the value for a string medium
 * (Web Storage, a cookie, a URL param), an optional `schema` that validates a decoded value at the
 * read boundary, and optional `versioning` that migrates an older persisted payload forward. An
 * in-memory scope holds the live reference and ignores all three; passing them anyway keeps
 * `createSource` uniform across every scope.
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
   * fabricated `Value`. Omit it only when the medium is trusted (in-memory) or the caller has made
   * an explicit trust decision.
   */
  readonly schema?: StandardSchemaV1<unknown, Value>
  /**
   * Optional schema-evolution policy for a persisted medium: stamp the current `version` on write
   * and run `migrate` forward when a read finds an older one. Omit it when the value's shape is
   * stable or the medium is trusted (in-memory).
   */
  readonly versioning?: PersistedVersioning<Value>
}

/**
 * A **scope**: the factory that builds a per-slot {@link StateSource} backend for one storage
 * medium — `memory`, `session`, `persistent`, `cookie`, `url`, and (later, from the query layer)
 * `remote`. It is the axis the scoped-state surface is parameterized by: moving a value between
 * scopes is a one-line `scope:` change, because the surface only ever talks to this factory.
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
   * composer can read them at construction (the secret guard reads `durable`/`sentToServer`/… here
   * to reject a secret placed in a non-memory scope) instead of waiting for a per-request source.
   * A built {@link StateSource} reports the same capabilities.
   */
  readonly capabilities: StateCapabilities
  /** Build the backend for one value slot. Called per request; performs no host access until used. */
  createSource<Value>(spec: SourceSpec<Value>): StateSource<Value>
}
