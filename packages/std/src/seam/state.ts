import type { WebAbortSignal } from "../web"
import type { Subscription } from "./events"

/**
 * What a scoped value's backend can do — the data the scoped-state surface reads to drive behavior
 * instead of branching on a scope name. Every {@link StateSource} carries one, so `memory`,
 * `persistent`, `cookie`, and a future `remote` scope are told apart by their capabilities, not by
 * a hard-coded name check.
 *
 * The serializer is deliberately **not** a field here: capabilities describe *where a value lives
 * and how it behaves*, whereas encoding is injected behavior a source composes in. Keeping the two
 * apart is why a `StateSerializer` is a separate, injected dependency (see
 * {@link StateSerializer}).
 */
export interface StateCapabilities {
  /**
   * Whether a change lands synchronously in the backend (`memory`, Web Storage) or resolves later
   * (IndexedDB, a remote store). Reads/writes are async-first on the {@link StateSource} either
   * way; a `sync` backend just settles immediately.
   */
  readonly access: "sync" | "async"
  /**
   * Who owns the source of truth. `local` values are authoritative on the client; `remote` values
   * are owned by a server that can invalidate/revalidate them (routed through the query layer).
   */
  readonly authority: "local" | "remote"
  /** Whether the value survives a full reload / process restart (Web Storage, cookie) or not (`memory`). */
  readonly durable: boolean
  /** Whether another tab/window of the same origin observes a change (`localStorage`, not `sessionStorage`). */
  readonly sharedAcrossTabs: boolean
  /**
   * Whether the backend transmits the value to the server automatically (a cookie). A `true` here
   * is a security signal: such a value must stay small and non-secret — tokens never live in one.
   */
  readonly sentToServer: boolean
  /**
   * Whether the value can be read at module import / during SSR without a host present. `memory` is
   * available immediately; host-backed scopes are not, so the surface seeds from the initial/server
   * value and reconciles against the backend only once mounted on the client.
   */
  readonly availableAtImport: boolean
}

/**
 * Encode a value to and from the string medium a storage-backed {@link StateSource} persists (Web
 * Storage, a cookie, a URL search param). Injected into a source rather than baked in, so the same
 * scope can carry a JSON object, a plain string, or a custom encoding — the `memory` scope needs no
 * serializer at all (it holds the live reference).
 *
 * `deserialize` runs at a trust boundary over an untrusted persisted string: an implementation that
 * cannot parse its input must throw (the source maps it to a typed error), never return a
 * fabricated value.
 */
export interface StateSerializer<Value> {
  /** Encode a value to its stored string form. */
  serialize(value: Value): string
  /** Decode a stored string back to a value; throw on malformed input rather than guess. */
  deserialize(raw: string): Value
}

/**
 * The **backend** half of a scoped value: where it is read from, written to, and how changes are
 * observed. This is the L0 "scope" seam every backend satisfies structurally — `memory`, `session`,
 * `persistent`, `cookie`, `url` now, and a `remote` store (over the query cache) later — so the
 * scoped-state surface composes any of them without importing them or naming a scope.
 *
 * It is intentionally **distinct** from the React-binding seam (`StateAdapter` in
 * `@plainworks/state`, which feeds a value into `useSyncExternalStore`): a scoped value is the
 * *composition* of a backend (this) and a binding. Keeping them separate lets a backend be tested
 * and reused with no React.
 *
 * A source addresses **one value slot** (its key is fixed at construction). Every method is
 * async-first so an async backend (IndexedDB, remote) needs no special-casing; a synchronous
 * backend returns already-resolved promises. Each accepts an optional {@link WebAbortSignal} so the
 * owner of the operation (the reconciler) can cancel in-flight work — a remote `get`/`set` must
 * abandon its network call when the Provider tears down, honoring a caller-owned deadline; a
 * synchronous backend settles immediately and simply ignores it. `subscribe` returns the canonical
 * {@link Subscription} — call `unsubscribe` exactly once to detach and release any host listener
 * the source owns.
 */
export interface StateSource<Value> {
  /** How this backend behaves — read, never branched on a scope name. */
  readonly capabilities: StateCapabilities
  /** Read the current stored value, or `undefined` when the slot is empty. */
  get(signal?: WebAbortSignal): Promise<Value | undefined>
  /** Write the value, persisting it and notifying subscribers. */
  set(value: Value, signal?: WebAbortSignal): Promise<void>
  /** Clear the slot, persisting the removal and notifying subscribers. */
  remove(signal?: WebAbortSignal): Promise<void>
  /**
   * Observe changes to the slot — from this source's own writes and, where the backend supports it,
   * from another tab or a navigation. `onChange` is a bare notification; re-read with {@link get}.
   */
  subscribe(onChange: () => void): Subscription
}
