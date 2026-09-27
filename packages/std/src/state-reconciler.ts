import { AbortError } from "./resilience"
import type { StateSource } from "./seam"
import type { WebAbortController, WebAbortSignal } from "./web"

/** Where a rejected reconciler read is routed — never swallowed. */
export type ReconcilerReport = (error: unknown) => void

/** The handle a {@link createSourceReconciler} returns: write through it, and start reconciling. */
export interface StateReconciler<Value> {
  /**
   * Persist `value` through the source. Call it after applying the value to the mirror: a read
   * already in flight is then discarded rather than clobbering the fresher local value. Resolves
   * once the write persists; rejects with the source's error, or with an {@link AbortError} when
   * it is cancelled — a newer write replaced it before it ran, or teardown stopped it.
   */
  readonly set: (value: Value) => Promise<void>
  /** Clear the slot through the source, ordered and settled exactly like {@link set}. */
  readonly remove: () => Promise<void>
  /** Perform the initial pull, subscribe for external changes, and return teardown. */
  readonly start: () => () => void
}

type Write = (signal: WebAbortSignal | undefined) => Promise<void>

interface QueuedWrite {
  readonly write: Write
  readonly resolve: () => void
  readonly reject: (error: unknown) => void
}

/**
 * Reconciles one {@link StateSource} backend into the mirror it feeds, **latest-wins** and
 * **removal-aware**, and owns the writes back to it — the races a naive `get().then(adopt)` and a
 * fire-and-forget `set()` get wrong:
 *
 * - **Out-of-order reads.** Two `get()`s can resolve in either order; an earlier one landing last
 *   would regress the value. Each pull takes a ticket (`latestPull`) and only the most recent pull
 *   is allowed to apply, so a slow read can never overwrite a newer one.
 * - **A local write racing a read.** An in-flight read started before a local write must not
 *   clobber that fresher value. Every write bumps `writeRevision`; a pull that began at an older
 *   revision is discarded on resolve, and a pull asked for while writes are pending waits for them
 *   to drain, so a persisted older write never shows over a newer one still queued.
 * - **Out-of-order writes.** Two writes to an async backend can settle in either order and persist
 *   the older value. Writes run one at a time, and at most one waits: a newer write cancels the
 *   waiting one, so the backend always ends on the latest value and no caller is held on a write
 *   that will never run.
 * - **External removal.** An external clear surfaces as an empty (`undefined`) read. The **first**
 *   pull treats empty as "backend has nothing, keep the seed"; a later, subscription-triggered pull
 *   treats empty as a removal and resets the mirror to its configured initial — so a cleared slot
 *   stops showing the stale value.
 *
 * It lives in `std` (the bottom layer) so `@plainworks/state`'s scoped mirrors,
 * `@plainworks/theme`'s provider, and the devtools dock share **one** reconciliation core instead
 * of each hand-rolling it. It is host-neutral: no React, no DOM — only the `StateSource` seam and
 * the universal `AbortController` primitive.
 *
 * `start` performs the initial pull, subscribes for external changes, owns an `AbortController`
 * whose signal is threaded into every read and write, and returns teardown — which aborts that
 * signal, so remote work still in flight is abandoned rather than resolving after unmount, and
 * cancels the writes still waiting. A write issued outside a started lifetime runs unsignalled.
 */
export function createSourceReconciler<Value>(params: {
  readonly source: StateSource<Value>
  /** Apply a real backend value to the mirror. */
  readonly adopt: (value: Value) => void
  /** Reset the mirror to its configured initial (an external removal). */
  readonly reset: () => void
  /** Where a rejected read is routed — never swallowed. */
  readonly report: ReconcilerReport
}): StateReconciler<Value> {
  const { source, adopt, reset, report } = params
  let active = false
  let writeRevision = 0
  let latestPull = 0
  // Owns cancellation for the work this reconciler starts: aborted on teardown so a remote call
  // still in flight abandons its network work instead of resolving into an unmounted mirror. Typed
  // as the shim's `WebAbortController` (not the DOM-lib global) so this module stays DOM-free and
  // compiles on React Native/Expo — `new AbortController()` binds to that same universal shim type.
  let controller: WebAbortController | undefined
  let writing = false
  let queued: QueuedWrite | undefined
  // A pull asked for while writes are pending, run once they drain; `initial` if the first was.
  let deferredPull: { readonly isInitial: boolean } | undefined

  const pull = (isInitial: boolean): void => {
    if (writing) {
      deferredPull = { isInitial: isInitial || deferredPull?.isInitial === true }
      return
    }
    const startedAt = writeRevision
    const ticket = ++latestPull
    const signal = controller?.signal
    source
      .get(signal)
      .then((value) => {
        // Discard the read if we were torn down, a newer pull superseded it, or a local write
        // landed while it was in flight — in every case a fresher value already owns the mirror.
        if (!active || ticket !== latestPull || writeRevision !== startedAt) {
          return
        }
        if (value !== undefined) {
          adopt(value)
        } else if (!isInitial) {
          // An empty read after mount is an external removal — restore the initial, not the stale
          // value.
          reset()
        }
      })
      .catch((error) => {
        // A read rejected because we aborted it on teardown is the cancellation we asked for, not a
        // backend failure — never surface it. Any other rejection is a real failure and is
        // reported.
        if (signal?.aborted === true) {
          return
        }
        report(error)
      })
  }

  const drain = (): void => {
    const next = queued
    queued = undefined
    writing = next !== undefined
    if (next === undefined) {
      const deferred = deferredPull
      deferredPull = undefined
      if (deferred !== undefined && active) pull(deferred.isInitial)
      return
    }
    const signal = controller?.signal
    let written: Promise<void>
    try {
      written = next.write(signal)
    } catch (error) {
      written = Promise.reject(error)
    }
    written
      .then(next.resolve, (error: unknown) => {
        // A backend rejecting because we aborted it is our cancellation: surface it as the typed
        // AbortError, whatever shape the backend used.
        next.reject(signal?.aborted === true ? new AbortError({ cause: signal.reason }) : error)
      })
      .finally(drain)
  }

  const enqueue = (write: Write): Promise<void> => {
    writeRevision++
    return new Promise<void>((resolve, reject) => {
      // The newest write replaces one still waiting, which never runs and settles now.
      queued?.reject(new AbortError())
      queued = { write, resolve, reject }
      if (!writing) drain()
    })
  }

  return {
    set: (value) => enqueue((signal) => source.set(value, signal)),
    remove: () => enqueue((signal) => source.remove(signal)),
    start: () => {
      active = true
      const owned = new AbortController()
      controller = owned
      // Reconcile once on mount (the stored value may differ from the SSR seed), then stay in sync
      // with external changes (another tab, a navigation, a remote push).
      pull(true)
      const subscription = source.subscribe(() => pull(false))
      return () => {
        active = false
        controller = undefined
        owned.abort()
        deferredPull = undefined
        queued?.reject(new AbortError({ cause: owned.signal.reason }))
        queued = undefined
        subscription.unsubscribe()
      }
    },
  }
}
