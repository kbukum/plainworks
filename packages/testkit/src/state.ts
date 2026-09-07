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
    get: async () => current,
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
 * Stands in for the future remote scope, proving the seam is general enough for it — build one per test.
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
