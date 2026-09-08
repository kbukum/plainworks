import { AbortError, type Delay, type WebAbortSignal } from "@plainworks/std"

/** A single not-yet-elapsed wait registered on a {@link ManualDelay}. */
export interface PendingDelay {
  /** The requested duration in milliseconds. */
  readonly ms: number
  /** Whether this wait has already settled (fired or aborted). */
  readonly settled: boolean
  /** Elapse this wait now, resolving the awaiting caller. */
  fire(): void
}

/**
 * A deterministic {@link Delay} whose waits never elapse on their own — the test decides exactly
 * when each one fires. Inject it wherever code awaits the `Delay` seam (backoff between retries, a
 * connect or idle timeout) so time-dependent behaviour is driven step by step instead of by the
 * wall clock.
 *
 * Every `delay(ms, signal)` registers a {@link PendingDelay}; fire it via
 * {@link ManualDelay.fireNext}, {@link ManualDelay.fireWhere}, or the pending handle. A wait whose
 * `signal` aborts rejects with the shared `AbortError` and leaves the queue, so cancellation is
 * exercised too. Build one per test.
 */
export interface ManualDelay {
  /** The injectable {@link Delay} — pass this to the code under test. */
  readonly delay: Delay
  /** Waits registered and not yet settled, in registration order. */
  readonly pending: readonly PendingDelay[]
  /** The durations of every wait ever registered, in order — for asserting a backoff sequence. */
  readonly waits: readonly number[]
  /** Fire the oldest pending wait; returns whether one was fired. */
  fireNext(): boolean
  /** Fire every pending wait whose duration satisfies `predicate`; returns how many fired. */
  fireWhere(predicate: (ms: number) => boolean): number
}

/** Build a {@link ManualDelay}. Nothing elapses until the test fires it. */
export function manualDelay(): ManualDelay {
  interface Entry {
    readonly ms: number
    settled: boolean
    /** Settle as fired (resolve). */
    fire(): void
  }
  const entries: Entry[] = []
  const waits: number[] = []

  const toHandle = (entry: Entry): PendingDelay => ({
    ms: entry.ms,
    get settled() {
      return entry.settled
    },
    fire() {
      entry.fire()
    },
  })

  const delay: Delay = (ms, signal?: WebAbortSignal) =>
    new Promise<void>((resolve, reject) => {
      waits.push(ms)
      if (signal?.aborted === true) {
        reject(new AbortError({ cause: signal.reason }))
        return
      }
      const entry: Entry = {
        ms,
        settled: false,
        fire() {
          settle(resolve)
        },
      }
      // Named so every settle path removes it — a long-lived signal must not accumulate one
      // listener per completed delay (matching `systemDelay`).
      function onAbort(): void {
        settle(() => reject(new AbortError({ cause: signal?.reason })))
      }
      function settle(run: () => void): void {
        if (entry.settled) {
          return
        }
        entry.settled = true
        signal?.removeEventListener("abort", onAbort)
        run()
      }
      entries.push(entry)
      signal?.addEventListener("abort", onAbort, { once: true })
    })

  return {
    delay,
    get pending() {
      return entries.filter((entry) => !entry.settled).map(toHandle)
    },
    get waits() {
      return waits
    },
    fireNext() {
      const entry = entries.find((candidate) => !candidate.settled)
      if (entry === undefined) {
        return false
      }
      entry.fire()
      return true
    },
    fireWhere(predicate) {
      let fired = 0
      for (const entry of entries) {
        if (!entry.settled && predicate(entry.ms)) {
          entry.fire()
          fired++
        }
      }
      return fired
    },
  }
}

/**
 * A deterministic {@link Delay} that lets retry backoff proceed automatically while a long
 * per-attempt timeout wait stays suspended. Inject it wherever code awaits the `Delay` seam for
 * both backoff and timeout on one budget — a wait shorter than the threshold elapses instantly, a
 * wait at or above it hangs until aborted.
 */
export interface AutoBackoffDelay {
  /** The injectable {@link Delay} — pass this to the code under test. */
  readonly delay: Delay
  /** The durations of every auto-elapsed backoff wait, in order — for asserting a backoff or `Retry-After` sequence. */
  readonly waits: readonly number[]
}

/**
 * Build an {@link AutoBackoffDelay}. A wait shorter than `thresholdMs` resolves instantly, so retry
 * backoff proceeds without real time and its duration is recorded in
 * {@link AutoBackoffDelay.waits}; a wait at or above the threshold stays pending until its signal
 * aborts (rejecting with the shared `AbortError`), so a large per-attempt timeout wait only fires
 * when the request sets a tiny timeout. One injected delay thus serves both the timeout and the
 * backoff paths. Prefer {@link manualDelay} when a test needs to fire each wait step by step.
 */
export function autoBackoffDelay(thresholdMs = 10_000): AutoBackoffDelay {
  const waits: number[] = []
  const delay: Delay = (ms, signal?: WebAbortSignal) => {
    if (signal?.aborted === true) {
      return Promise.reject(new AbortError({ cause: signal.reason }))
    }
    if (ms >= thresholdMs) {
      return new Promise<void>((_, reject) => {
        signal?.addEventListener("abort", () => reject(new AbortError({ cause: signal.reason })), {
          once: true,
        })
      })
    }
    waits.push(ms)
    return Promise.resolve()
  }
  return {
    delay,
    get waits() {
      return waits
    },
  }
}
