import type { StateCapabilities, StateSource } from "@plainworks/std"

// Sensible defaults for a fake local, in-memory backend: synchronous, client-owned, transient.
const DEFAULT_CAPABILITIES: StateCapabilities = {
  access: "sync",
  authority: "local",
  durable: false,
  sharedAcrossTabs: false,
  sentToServer: false,
  availableAtImport: true,
}

/** Options for {@link fakeStateSource}. */
export interface FakeStateSourceOptions<Value> {
  /** Seed value; defaults to an empty slot. */
  readonly initial?: Value
  /** Override any capability flag — e.g. mark it `durable`/`sentToServer` to stand in for a cookie. */
  readonly capabilities?: Partial<StateCapabilities>
  /** Reject reads with this value, for deterministic failure-path tests. */
  readonly getError?: unknown
  /** Reject writes with this value, for deterministic failure-path tests. */
  readonly setError?: unknown
}

/** An in-memory {@link StateSource} fake with introspection for assertions. */
export interface FakeStateSource<Value> extends StateSource<Value> {
  /** The stored value read synchronously, bypassing the async `get()` — for assertions. */
  readonly current: Value | undefined
  /** Live subscriber count; `0` proves every subscription tore down. */
  readonly subscriberCount: number
}

/**
 * A deterministic in-memory {@link StateSource} — the shared fake every package tests scoped state
 * against without a real browser store. Synchronous by default; pass `capabilities` to mimic a
 * durable/cookie-like or cross-tab backend. Never a shared singleton — build one per test.
 */
export function fakeStateSource<Value>(
  options: FakeStateSourceOptions<Value> = {},
): FakeStateSource<Value> {
  let current = options.initial
  const capabilities: StateCapabilities = { ...DEFAULT_CAPABILITIES, ...options.capabilities }
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of [...listeners]) listener()
  }
  return {
    capabilities,
    get: async () => {
      if (options.getError !== undefined) {
        throw options.getError
      }
      return current
    },
    set: async (value) => {
      if (options.setError !== undefined) {
        throw options.setError
      }
      current = value
      notify()
    },
    remove: async () => {
      current = undefined
      notify()
    },
    subscribe(onChange) {
      listeners.add(onChange)
      return { unsubscribe: () => listeners.delete(onChange) }
    },
    get current() {
      return current
    },
    get subscriberCount() {
      return listeners.size
    },
  }
}

/** Options for {@link asyncStateSource}. */
export interface AsyncStateSourceOptions<Value> {
  /** Seed value; defaults to an empty slot. */
  readonly initial?: Value
  /** Override any capability flag; defaults describe an async, server-authoritative backend. */
  readonly capabilities?: Partial<StateCapabilities>
}

/** A controllable async {@link StateSource} fake: reads are gated so a test drives the timing. */
export interface AsyncStateSource<Value> extends StateSource<Value> {
  /** Resolve every `get()` currently awaiting the gate with the present stored value. */
  releaseReads(): Promise<void>
  /** How many `get()` calls are parked, waiting for {@link AsyncStateSource.releaseReads}. */
  readonly pendingReads: number
  /** Simulate an external writer (another tab, a server push): set the value and notify subscribers. */
  externalSet(value: Value): void
  /** The stored value read synchronously — for assertions. */
  readonly current: Value | undefined
  /** Live subscriber count; `0` proves teardown. */
  readonly subscriberCount: number
}

// An async, server-authoritative backend that is not available at import — the shape the future
// remote scope will have, so the scoped-state surface can be proven general enough for it now.
const ASYNC_DEFAULT_CAPABILITIES: StateCapabilities = {
  access: "async",
  authority: "remote",
  durable: true,
  sharedAcrossTabs: false,
  sentToServer: false,
  availableAtImport: false,
}

/**
 * A {@link StateSource} whose `get()` resolves only when the test calls {@link
 * AsyncStateSource.releaseReads}, so a test can assert the surface renders its seed *before* the
 * backend resolves (the no-hydration-flash guarantee) and control an async reconcile step by step.
 * Stands in for the future remote scope, proving the seam is general enough for it — build one per
 * test.
 */
export function asyncStateSource<Value>(
  options: AsyncStateSourceOptions<Value> = {},
): AsyncStateSource<Value> {
  let current = options.initial
  const capabilities: StateCapabilities = {
    ...ASYNC_DEFAULT_CAPABILITIES,
    ...options.capabilities,
  }
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of [...listeners]) listener()
  }
  const pending: Array<() => void> = []
  return {
    capabilities,
    get: (signal) =>
      new Promise<Value | undefined>((resolve, reject) => {
        if (signal?.aborted === true) {
          reject(signal.reason)
          return
        }
        const settle = (): void => resolve(current)
        pending.push(settle)
        // A parked read that is aborted (Provider teardown) rejects and leaves the gate, so an
        // abandoned reconcile never resolves into an unmounted mirror — the reconciler's own signal
        // drives this, proving the seam actually cancels rather than merely accepting a signal.
        signal?.addEventListener(
          "abort",
          () => {
            const index = pending.indexOf(settle)
            if (index !== -1) {
              pending.splice(index, 1)
              reject(signal.reason)
            }
          },
          { once: true },
        )
      }),
    set: async (value) => {
      current = value
      notify()
    },
    remove: async () => {
      current = undefined
      notify()
    },
    subscribe(onChange) {
      listeners.add(onChange)
      return { unsubscribe: () => listeners.delete(onChange) }
    },
    async releaseReads() {
      for (const resolve of pending.splice(0)) resolve()
      // Let the resolved `get()` continuations run before the caller asserts.
      await Promise.resolve()
    },
    externalSet(value) {
      current = value
      notify()
    },
    get pendingReads() {
      return pending.length
    },
    get current() {
      return current
    },
    get subscriberCount() {
      return listeners.size
    },
  }
}

/** One read parked inside {@link DeferredStateSource.get}; settle it in any order. */
export interface DeferredRead<Value> {
  /** Whether the test has already settled this read. */
  readonly settled: boolean
  /** Resolve the read with a value — out-of-order versus later reads, to drive race tests. */
  readonly resolve: (value: Value | undefined) => void
  /** Reject the read, for failure-path races. */
  readonly reject: (reason: unknown) => void
}

/** A {@link StateSource} whose every `get()` parks until the test settles that read individually. */
export interface DeferredStateSource<Value> extends StateSource<Value> {
  /** Every read in arrival order, settled ones included; settle parked ones in any order. */
  readonly reads: ReadonlyArray<DeferredRead<Value>>
  /** The stored value read synchronously — for assertions. */
  readonly current: Value | undefined
  /** Live subscriber count; `0` proves teardown. */
  readonly subscriberCount: number
}

/** Options for {@link deferredStateSource}. */
export interface DeferredStateSourceOptions<Value> extends FakeStateSourceOptions<Value> {
  /**
   * Whether a local `set`/`remove` notifies subscribers. Defaults to `true`. Set `false` to model a
   * backend that does not echo the local writer back through its own subscription — the case that
   * exercises a reconciler's local-write marking, since no subscription-triggered read then masks a
   * stale read still in flight.
   */
  readonly echoesLocalWrites?: boolean
}

/**
 * A {@link StateSource} giving the test per-read control over *when* and *with what* each `get()`
 * resolves — the harness for last-write-wins and stale-read races that the gated
 * {@link asyncStateSource} (one release for every parked read) cannot express. Honours abort
 * signals like the other fakes. Build one per test.
 */
export function deferredStateSource<Value>(
  options: DeferredStateSourceOptions<Value> = {},
): DeferredStateSource<Value> {
  let current = options.initial
  const echoesLocalWrites = options.echoesLocalWrites ?? true
  const capabilities: StateCapabilities = { ...DEFAULT_CAPABILITIES, ...options.capabilities }
  const listeners = new Set<() => void>()
  const reads: DeferredRead<Value>[] = []
  const notify = (): void => {
    for (const listener of [...listeners]) listener()
  }
  return {
    capabilities,
    get: (signal) =>
      new Promise<Value | undefined>((resolvePromise, rejectPromise) => {
        if (signal?.aborted === true) {
          rejectPromise(signal.reason)
          return
        }
        const state = { settled: false }
        const read: DeferredRead<Value> = {
          get settled() {
            return state.settled
          },
          resolve: (value) => {
            state.settled = true
            resolvePromise(value)
          },
          reject: (reason) => {
            state.settled = true
            rejectPromise(reason)
          },
        }
        reads.push(read)
        // An aborted parked read rejects so an abandoned caller never resolves into stale state.
        signal?.addEventListener("abort", () => read.reject(signal.reason), { once: true })
      }),
    set: async (value) => {
      current = value
      if (echoesLocalWrites) {
        notify()
      }
    },
    remove: async () => {
      current = undefined
      if (echoesLocalWrites) {
        notify()
      }
    },
    subscribe(onChange) {
      listeners.add(onChange)
      return { unsubscribe: () => listeners.delete(onChange) }
    },
    get reads() {
      return reads
    },
    get current() {
      return current
    },
    get subscriberCount() {
      return listeners.size
    },
  }
}
