"use client"

import type { StateSource, WebAbortController } from "@plainworks/std"
import type { Report } from "./surface"

/**
 * Reconciles one {@link StateSource} backend into the mirror it feeds, **latest-wins** and
 * **removal-aware** — the two races a naive `get().then(adopt)` gets wrong:
 *
 * - **Out-of-order reads.** Two `get()`s can resolve in either order; an earlier one landing last
 *   would regress the value. Each pull takes a ticket (`latestPull`) and only the most recent pull
 *   is allowed to apply, so a slow read can never overwrite a newer one.
 * - **A local write racing a read.** An in-flight read started before an optimistic `set` must not
 *   clobber that fresher local value. Every local write bumps `writeRevision`; a pull that began at
 *   an older revision is discarded on resolve.
 * - **External removal.** An external clear surfaces as an empty (`undefined`) read. The **first**
 *   pull treats empty as "backend has nothing, keep the seed"; a later, subscription-triggered pull
 *   treats empty as a removal and resets the mirror to its configured initial — so a cleared slot
 *   stops showing the stale value.
 *
 * The returned `markLocalWrite` must be called by the owning `set`/`remove` before it mutates the
 * mirror; `start` performs the initial pull, subscribes for external changes, owns an
 * `AbortController` whose signal is threaded into every read, and returns teardown — which aborts
 * that signal so an in-flight remote read abandons its work rather than resolving after unmount.
 */
export function createSourceReconciler<Value>(params: {
  readonly source: StateSource<Value>
  /** Apply a real backend value to the mirror. */
  readonly adopt: (value: Value) => void
  /** Reset the mirror to its configured initial (an external removal). */
  readonly reset: () => void
  /** Where a rejected read is routed — never swallowed. */
  readonly report: Report
}): { readonly markLocalWrite: () => void; readonly start: () => () => void } {
  const { source, adopt, reset, report } = params
  let active = false
  let writeRevision = 0
  let latestPull = 0
  // Owns cancellation for the reads this reconciler starts: aborted on teardown so a remote `get`
  // still in flight abandons its network work instead of resolving into an unmounted mirror. Typed as
  // the shim's `WebAbortController` (not the DOM-lib global) so this client module stays DOM-free and
  // compiles on React Native/Expo — `new AbortController()` binds to that same universal shim type.
  let controller: WebAbortController | undefined

  const pull = (isInitial: boolean): void => {
    const startedAt = writeRevision
    const ticket = ++latestPull
    const signal = controller?.signal
    source
      .get(signal)
      .then((value) => {
        // Discard the read if we were torn down, a newer pull superseded it, or a local write landed
        // while it was in flight — in every case a fresher value already owns the mirror.
        if (!active || ticket !== latestPull || writeRevision !== startedAt) {
          return
        }
        if (value !== undefined) {
          adopt(value)
        } else if (!isInitial) {
          // An empty read after mount is an external removal — restore the initial, not the stale value.
          reset()
        }
      })
      .catch((error) => {
        // A read rejected because we aborted it on teardown is the cancellation we asked for, not a
        // backend failure — never surface it. Any other rejection is a real failure and is reported.
        if (signal?.aborted === true) {
          return
        }
        report(error)
      })
  }

  return {
    markLocalWrite: () => {
      writeRevision++
    },
    start: () => {
      active = true
      controller = new AbortController()
      // Reconcile once on mount (the stored value may differ from the SSR seed), then stay in sync
      // with external changes (another tab, a navigation, a remote push).
      pull(true)
      const subscription = source.subscribe(() => pull(false))
      return () => {
        active = false
        controller?.abort()
        subscription.unsubscribe()
      }
    },
  }
}
