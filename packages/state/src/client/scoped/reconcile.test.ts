// Default `node` environment: the reconciler is the correctness core of scoped-state async
// reconciliation, so it is driven directly with a hand-built, fully controllable source — no host,
// no React — to prove the three races it exists to close: out-of-order reads, a local write racing
// an in-flight read, and an external removal.

import type { StateSource } from "@plainworks/std"
import { describe, expect, test } from "vitest"
import { createSourceReconciler } from "./reconcile"

/** A source whose every `get()` parks until the test resolves it, in an order the test controls. */
function controllableSource(): {
  source: StateSource<string>
  resolveRead: (which: "first" | "last", value: string | undefined) => void
  pending: number
  emitExternal: () => void
} {
  const reads: Array<(value: string | undefined) => void> = []
  const listeners = new Set<() => void>()
  const source: StateSource<string> = {
    capabilities: {
      access: "async",
      authority: "remote",
      durable: true,
      sharedAcrossTabs: false,
      sentToServer: false,
      availableAtImport: false,
    },
    get: () => new Promise((resolve) => reads.push(resolve)),
    // Writes are irrelevant to the reconciler's read/adopt logic under test, so they are no-ops here;
    // each pull's outcome is driven by `resolveRead` with an explicit value.
    set: async () => {},
    remove: async () => {},
    subscribe: (onChange) => {
      listeners.add(onChange)
      return { unsubscribe: () => listeners.delete(onChange) }
    },
  }
  return {
    source,
    resolveRead: (which, value) => {
      const resolve = which === "first" ? reads.shift() : reads.pop()
      resolve?.(value)
    },
    get pending() {
      return reads.length
    },
    emitExternal: () => {
      for (const listener of [...listeners]) listener()
    },
  }
}

const flush = (): Promise<void> => Promise.resolve()

describe("createSourceReconciler", () => {
  test("latest-wins: an earlier read resolving last cannot overwrite a newer one", async () => {
    const adopted: string[] = []
    const control = controllableSource()
    const reconciler = createSourceReconciler<string>({
      source: control.source,
      adopt: (value) => adopted.push(value),
      reset: () => adopted.push("<reset>"),
      report: () => {},
    })
    const teardown = reconciler.start() // initial pull (read #1, ticket 1)
    control.emitExternal() // subscription-triggered pull (read #2, ticket 2)
    expect(control.pending).toBe(2)

    // Resolve the newer pull (#2) first, then the older pull (#1): latest-wins must keep #2's value
    // and discard the older read that lands last.
    control.resolveRead("last", "newer")
    await flush()
    control.resolveRead("first", "older")
    await flush()

    expect(adopted).toEqual(["newer"])
    teardown()
  })

  test("a local write marked mid-read prevents a stale read from clobbering it", async () => {
    const adopted: string[] = []
    const control = controllableSource()
    const reconciler = createSourceReconciler<string>({
      source: control.source,
      adopt: (value) => adopted.push(value),
      reset: () => adopted.push("<reset>"),
      report: () => {},
    })
    const teardown = reconciler.start() // initial pull in flight
    reconciler.markLocalWrite() // a fresh local write lands while the read is pending
    control.resolveRead("first", "stale-backend-value")
    await flush()

    // The in-flight read began before the write, so its value is discarded — the local write wins.
    expect(adopted).toEqual([])
    teardown()
  })

  test("removal-aware: an empty read after mount resets to the initial", async () => {
    const events: string[] = []
    const control = controllableSource()
    const reconciler = createSourceReconciler<string>({
      source: control.source,
      adopt: (value) => events.push(`adopt:${value}`),
      reset: () => events.push("reset"),
      report: () => {},
    })
    const teardown = reconciler.start()
    control.resolveRead("first", "stored") // initial pull adopts the stored value
    await flush()
    control.emitExternal() // external clear → subscription pull
    control.resolveRead("first", undefined) // empty read
    await flush()

    expect(events).toEqual(["adopt:stored", "reset"])
    teardown()
  })

  test("the initial empty read keeps the seed (no reset)", async () => {
    const events: string[] = []
    const control = controllableSource()
    const reconciler = createSourceReconciler<string>({
      source: control.source,
      adopt: (value) => events.push(`adopt:${value}`),
      reset: () => events.push("reset"),
      report: () => {},
    })
    const teardown = reconciler.start()
    control.resolveRead("first", undefined) // empty backend on first pull → keep seed
    await flush()

    expect(events).toEqual([])
    teardown()
  })

  test("teardown stops further applies and unsubscribes", async () => {
    const events: string[] = []
    const control = controllableSource()
    const reconciler = createSourceReconciler<string>({
      source: control.source,
      adopt: (value) => events.push(`adopt:${value}`),
      reset: () => events.push("reset"),
      report: () => {},
    })
    const teardown = reconciler.start()
    teardown()
    control.resolveRead("first", "late") // resolves after teardown
    await flush()

    expect(events).toEqual([])
  })

  test("threads its abort signal into reads and cancels them on teardown without reporting", async () => {
    const seenSignals: (boolean | undefined)[] = []
    const reported: unknown[] = []
    // A signal-aware source: it records whether a signal arrived and rejects the read when that
    // signal aborts — the shape a remote backend has, so teardown must cancel rather than surface.
    const source: StateSource<string> = {
      capabilities: {
        access: "async",
        authority: "remote",
        durable: true,
        sharedAcrossTabs: false,
        sentToServer: false,
        availableAtImport: false,
      },
      get: (signal) =>
        new Promise((_resolve, reject) => {
          seenSignals.push(signal?.aborted)
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true })
        }),
      set: async () => {},
      remove: async () => {},
      subscribe: () => ({ unsubscribe: () => {} }),
    }
    const reconciler = createSourceReconciler<string>({
      source,
      adopt: () => {},
      reset: () => {},
      report: (error) => reported.push(error),
    })
    const teardown = reconciler.start()
    expect(seenSignals).toEqual([false]) // a signal was threaded into the pull, not yet aborted
    teardown() // aborts the owned controller → the in-flight read rejects
    await flush()
    await flush()

    // The read rejected because we cancelled it: that is expected teardown, never a reported failure.
    expect(reported).toEqual([])
  })
})
