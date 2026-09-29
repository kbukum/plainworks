// Default `node` environment: the reconciler is the correctness core of scoped-state async
// reconciliation, so it is driven directly with a hand-built, fully controllable source — no host,
// no React — to prove the three races it exists to close: out-of-order reads, a local write racing
// an in-flight read, and an external removal.

import type { StateSource } from "@plainworks/std/seam"
import { describe, expect, test } from "vitest"
import { AbortError } from "../resilience"
import type { WebAbortSignal } from "../web"
import { createSourceReconciler } from "./state-reconciler"

interface PendingWrite {
  readonly op: string
  readonly signal: WebAbortSignal | undefined
  /** Persist the write: store its value and notify subscribers, as a real backend does. */
  readonly resolve: () => void
  readonly reject: (error: unknown) => void
}

/**
 * A source whose every `set`/`remove` parks until the test settles it, rejecting with the signal's
 * reason when that signal aborts — the shape a remote backend has. A settled write stores its value
 * and notifies subscribers; `get` reads the stored value.
 */
function controllableWrites(): {
  source: StateSource<string>
  writes: PendingWrite[]
  readonly stored: string | undefined
} {
  const writes: PendingWrite[] = []
  const listeners = new Set<() => void>()
  let stored: string | undefined
  const park = (
    op: string,
    value: string | undefined,
    signal: WebAbortSignal | undefined,
  ): Promise<void> =>
    new Promise((resolve, reject) => {
      const persist = (): void => {
        stored = value
        resolve()
        for (const listener of [...listeners]) listener()
      }
      writes.push({ op, signal, resolve: persist, reject })
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true })
    })
  const source: StateSource<string> = {
    capabilities: {
      access: "async",
      authority: "remote",
      durable: true,
      sharedAcrossTabs: false,
      sentToServer: false,
      availableAtImport: false,
    },
    get: async () => stored,
    set: (value, signal) => park(`set:${value}`, value, signal),
    remove: (signal) => park("remove", undefined, signal),
    subscribe: (onChange) => {
      listeners.add(onChange)
      return { unsubscribe: () => listeners.delete(onChange) }
    },
  }
  return {
    source,
    writes,
    get stored() {
      return stored
    },
  }
}

function writeReconciler(source: StateSource<string>, adopted: string[] = []) {
  return createSourceReconciler<string>({
    source,
    adopt: (value) => adopted.push(value),
    reset: () => adopted.push("<reset>"),
    report: () => {},
  })
}

/** Run enough microtask turns for every settled promise chain in these tests to finish. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn++) await Promise.resolve()
}

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
    // Writes are irrelevant to the reconciler's read/adopt logic under test, so they are no-ops
    // here; each pull's outcome is driven by `resolveRead` with an explicit value.
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
    void reconciler.set("local") // a fresh local write lands while the read is pending
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

    // The read rejected because we cancelled it: that is expected teardown, never a reported
    // failure.
    expect(reported).toEqual([])
  })
})

describe("createSourceReconciler writes", () => {
  test("persist through the source with the teardown-owned signal", async () => {
    const { source, writes } = controllableWrites()
    const reconciler = writeReconciler(source)
    const teardown = reconciler.start()
    const written = reconciler.set("a")
    expect(writes.map((write) => write.op)).toEqual(["set:a"])
    expect(writes[0]?.signal?.aborted).toBe(false)
    writes[0]?.resolve()
    await expect(written).resolves.toBeUndefined()
    teardown()
  })

  test("run one at a time; a newer write cancels the one still waiting", async () => {
    const { source, writes } = controllableWrites()
    const reconciler = writeReconciler(source)
    const teardown = reconciler.start()
    const first = reconciler.set("a")
    const replaced = reconciler.set("b")
    const latest = reconciler.remove()
    // Only the first write is in flight. "b" never runs: it settles at once, so no caller is held
    // waiting on a write that was replaced.
    expect(writes.map((write) => write.op)).toEqual(["set:a"])
    await expect(replaced).rejects.toBeInstanceOf(AbortError)
    writes[0]?.resolve()
    await expect(first).resolves.toBeUndefined()
    await settle()
    expect(writes.map((write) => write.op)).toEqual(["set:a", "remove"])
    writes[1]?.resolve()
    await expect(latest).resolves.toBeUndefined()
    teardown()
  })

  test("a failed write rejects with the source's error", async () => {
    const { source, writes } = controllableWrites()
    const reconciler = writeReconciler(source)
    const teardown = reconciler.start()
    const quota = new Error("quota")
    const written = reconciler.set("a")
    writes[0]?.reject(quota)
    await expect(written).rejects.toBe(quota)
    teardown()
  })

  test("a synchronous source throw rejects the write instead of escaping the caller", async () => {
    const reconciler = writeReconciler({
      ...controllableWrites().source,
      set: () => {
        throw new Error("sync")
      },
    })
    await expect(reconciler.set("a")).rejects.toThrow("sync")
  })

  test("a persisted older write cannot regress the value a queued write already applied", async () => {
    const adopted: string[] = []
    const backend = controllableWrites()
    const reconciler = writeReconciler(backend.source, adopted)
    const teardown = reconciler.start()
    await settle() // the initial pull finds nothing
    void reconciler.set("a")
    void reconciler.set("b") // applied optimistically; waits behind "a"
    // "a" persists and notifies subscribers: re-reading now would adopt "a" over the optimistic
    // "b", so the pull waits until the writes drain.
    backend.writes[0]?.resolve()
    await settle()
    expect(adopted).toEqual([])
    backend.writes[1]?.resolve()
    await settle()
    // One pull after the drain, which reads what the backend ended on.
    expect(adopted).toEqual(["b"])
    teardown()
  })

  test("teardown cancels the in-flight and waiting writes with a typed AbortError", async () => {
    const { source, writes } = controllableWrites()
    const reconciler = writeReconciler(source)
    const teardown = reconciler.start()
    const inFlight = reconciler.set("a")
    const waiting = reconciler.set("b")
    teardown()
    expect(writes[0]?.signal?.aborted).toBe(true)
    await expect(inFlight).rejects.toBeInstanceOf(AbortError)
    await expect(waiting).rejects.toBeInstanceOf(AbortError)
    await settle()
    // The waiting write never reached the source.
    expect(writes.map((write) => write.op)).toEqual(["set:a"])
  })

  test("a write after teardown still persists", async () => {
    const { source, writes } = controllableWrites()
    const reconciler = writeReconciler(source)
    reconciler.start()()
    const later = reconciler.set("late")
    expect(writes.map((write) => write.op)).toEqual(["set:late"])
    expect(writes[0]?.signal).toBeUndefined()
    writes[0]?.resolve()
    await expect(later).resolves.toBeUndefined()
  })
})
