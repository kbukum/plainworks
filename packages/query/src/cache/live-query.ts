import { isPositiveInteger } from "@plainworks/std"
import { createEmitter } from "@plainworks/std/emitter"
import { RemoteFailure } from "@plainworks/std/failure"
import { type RandomSource, systemRandom } from "@plainworks/std/random"
import {
  assertBackoffPolicy,
  assertTimerMs,
  type BackoffPolicy,
  type Delay,
  defaultBackoff,
  retryDelay,
  systemDelay,
  withTimeout,
} from "@plainworks/std/resilience"
import type { EventSink, PlainEvent, Subscription } from "@plainworks/std/seam"
import { type Clock, systemClock } from "@plainworks/std/time"
import type { WebAbortSignal } from "@plainworks/std/web"
import type { QueryClient, QueryFunction, QueryKey } from "@tanstack/query-core"

export type LiveQueryStatus = "waiting" | "refreshing" | "fresh" | "stale" | "closed"

export interface LiveQueryOptions {
  /** Maximum snapshots in one recovery cycle; churn does not reset this budget. Default two. */
  readonly maxRefetches?: number
  /** Total snapshot and delay budget in milliseconds. Default 30 seconds. */
  readonly budgetMs?: number
  readonly backoff?: BackoffPolicy
  readonly clock?: Clock
  readonly random?: RandomSource
  readonly delay?: Delay
}

/** A visible failure to converge; cached data stays stale rather than claiming success. */
export class SnapshotStaleError extends RemoteFailure<"query/stale"> {
  override readonly name: string = "SnapshotStaleError"
  constructor(options?: { cause?: unknown }) {
    super(
      "query/stale",
      {
        code: "EXTERNAL_SERVICE_ERROR",
        message: "Live data could not be synchronized. Refresh to try again.",
        retryable: false,
        violations: [],
      },
      options,
    )
  }
}

/** One fetch owner for a live query, including remote-cache consumers with disabled observers. */
export interface LiveQuery extends EventSink {
  connected(signal: WebAbortSignal): void
  reset(signal: WebAbortSignal): void
  /** Explicit user retry starts a new finite recovery cycle. */
  refresh(): void
  close(): void
  readonly status: LiveQueryStatus
  readonly error: SnapshotStaleError | undefined
  subscribe(listener: () => void): Subscription
}

/**
 * Wire this sink before opening the channel. Only `connected` starts the initial snapshot.
 * Events invalidate, never overlay deltas. A raced fetch is cancelled and cannot commit.
 * Query retries are disabled; transport failures stop recovery, preserving their own retry owner.
 */
export function createLiveQuery<Value>(
  client: QueryClient,
  query: { readonly queryKey: QueryKey; readonly queryFn: QueryFunction<Value> },
  options: LiveQueryOptions = {},
): LiveQuery {
  const {
    maxRefetches = 2,
    budgetMs = 30_000,
    backoff = defaultBackoff,
    clock = systemClock,
    random = systemRandom,
    delay = systemDelay,
  } = options
  if (!isPositiveInteger(maxRefetches) || !isPositiveInteger(budgetMs)) {
    throw new RangeError("Live query budgets must be positive integers.")
  }
  assertTimerMs(budgetMs)
  assertBackoffPolicy(backoff)
  const owner = new AbortController()
  const changes = createEmitter<void>()
  const filters = { queryKey: query.queryKey, exact: true }
  let status: LiveQueryStatus = "waiting"
  let error: SnapshotStaleError | undefined
  let generation = 0
  let attempts = 0
  let started = false
  let running = false
  let exhausted = false
  let marking = false
  client.getQueryCache().build(client, client.defaultQueryOptions({ ...query, retry: false }))

  const publish = (next: LiveQueryStatus): void => {
    status = next
    changes.emit()
  }
  const markStale = (): void => {
    // cancelQueries rejects the old retryer synchronously, even when the fetch ignores its signal.
    marking = true
    try {
      void client.cancelQueries(filters)
      client.getQueryCache().find(filters)?.invalidate()
    } finally {
      marking = false
    }
  }
  const recover = async (): Promise<void> => {
    const expiresAt = clock.now() + budgetMs
    try {
      while (!owner.signal.aborted && attempts < maxRefetches) {
        const wait = retryDelay(backoff, attempts, random)
        if (wait >= expiresAt - clock.now()) break
        if (wait > 0) await delay(wait, owner.signal)
        else await Promise.resolve()
        if (owner.signal.aborted) return
        const snapshotGeneration = generation
        attempts++
        try {
          await withTimeout(
            async () =>
              client.query({
                ...query,
                staleTime: 0,
                retry: false,
                queryFn: async (context) => {
                  const data = await query.queryFn(context)
                  if (snapshotGeneration !== generation || owner.signal.aborted) {
                    throw new SnapshotStaleError()
                  }
                  return data
                },
              }),
            Math.max(1, expiresAt - clock.now()),
            { signal: owner.signal, delay },
          )
        } catch (cause) {
          if (owner.signal.aborted) return
          if (snapshotGeneration !== generation) continue
          throw new SnapshotStaleError({ cause })
        }
        if (snapshotGeneration === generation) {
          attempts = 0
          error = undefined
          running = false
          publish("fresh")
          return
        }
      }
      if (!owner.signal.aborted) throw new SnapshotStaleError()
    } catch (cause) {
      if (!owner.signal.aborted) {
        markStale()
        exhausted = true
        error = cause instanceof SnapshotStaleError ? cause : new SnapshotStaleError({ cause })
        running = false
        publish("stale")
      }
    }
  }
  const invalidate = (): void => {
    if (owner.signal.aborted) return
    generation++
    markStale()
    if (!started || running || exhausted) return
    running = true
    publish("refreshing")
    void recover()
  }
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (
      !marking &&
      event.type === "updated" &&
      event.action.type === "invalidate" &&
      event.query === client.getQueryCache().find(filters)
    )
      invalidate()
  })
  return {
    connected(signal): void {
      // Every connection is a fresh subscription. Controls carry no resume cursor, so a reconnect
      // after the snapshot settled cannot replay offline changes — reconcile by refetching instead
      // of trusting stale data. In-flight recovery discards pre-boundary snapshots and coalesces
      // reconnects into a follow-up fetch without resetting the bounded budget.
      if (signal.aborted) return
      started = true
      invalidate()
    },
    deliver(_event: PlainEvent, signal): void {
      if (!signal.aborted) invalidate()
    },
    reset(signal): void {
      if (!signal.aborted) {
        started = true
        invalidate()
      }
    },
    refresh(): void {
      if (running || owner.signal.aborted) return
      started = true
      attempts = 0
      exhausted = false
      error = undefined
      invalidate()
    },
    close(): void {
      if (owner.signal.aborted) return
      unsubscribe()
      owner.abort()
      running = false
      markStale()
      publish("closed")
      changes.clear()
    },
    get status() {
      return status
    },
    get error() {
      return error
    },
    subscribe: (listener) => changes.subscribe(listener),
  }
}
