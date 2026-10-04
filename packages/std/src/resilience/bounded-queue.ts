import { PlainError } from "../errors"
import { isPositiveInteger } from "../guard"
import type { WebAbortSignal } from "../web/types"
import { AbortError } from "./timeout"

/**
 * What a full queue does with a newly pushed item: `drop-new` rejects the newcomer, `drop-oldest`
 * evicts the head to make room (freshest-wins), `reject` throws. Every option keeps memory bounded
 * — there is no unbounded buffering.
 */
export type OverflowPolicy = "drop-new" | "drop-oldest" | "reject"

/** Raised by `push` at capacity under the `reject` overflow policy. */
export class QueueFullError extends PlainError<"std/queue-full"> {
  override readonly name: string = "QueueFullError"
  constructor(limit: number) {
    super("std/queue-full", `Queue is full (limit ${limit})`)
  }
}

/** Raised by `pop` when the pending-consumer bound (`maxWaiters`) is reached — consumer-waiter saturation, distinct from producer-capacity backpressure. */
export class QueueWaitersFullError extends PlainError<"std/queue-waiters-full"> {
  override readonly name: string = "QueueWaitersFullError"
  constructor(limit: number) {
    super("std/queue-waiters-full", `Queue has too many pending consumers (limit ${limit})`)
  }
}

/** Raised when awaiting `pop` on a closed, drained queue. */
export class QueueClosedError extends PlainError<"std/queue-closed"> {
  override readonly name: string = "QueueClosedError"
  constructor() {
    super("std/queue-closed", "Queue is closed")
  }
}

/**
 * A bounded FIFO queue with explicit backpressure. Producers `push` (bounded by
 * {@link OverflowPolicy}); consumers `pop` await the next item. Both sides are bounded: buffered
 * items by `capacity`, pending consumers by `maxWaiters`, so memory never grows without limit.
 * Build one per pipeline; never a module singleton.
 */
export interface BoundedQueue<T> {
  /** Number of buffered items. */
  readonly size: number
  /** Maximum buffered items. */
  readonly capacity: number
  /** Enqueue `item`; returns whether it was accepted (an evicted head still counts as accepted). */
  push(item: T): boolean
  /**
   * Await the next item; rejects with {@link QueueClosedError} if the queue closes while empty,
   * with {@link QueueWaitersFullError} when the pending-consumer bound is reached, or with an
   * `AbortError` when `options.signal` aborts (which removes the waiter, freeing its slot).
   */
  pop(options?: { signal?: WebAbortSignal }): Promise<T>
  /** Take an item without waiting, or `undefined` if none is buffered. */
  tryPop(): T | undefined
  /** Close the queue: reject waiting consumers and refuse further pushes. Idempotent. */
  close(): void
}

/** Options for {@link createBoundedQueue}. */
export interface BoundedQueueOptions<T> {
  /** What a full queue does with a pushed item. Defaults to `drop-oldest`. */
  readonly overflow?: OverflowPolicy
  /** Maximum pending consumers. Defaults to the queue capacity. */
  readonly maxWaiters?: number
  /**
   * Hears every item the overflow policy discards: the evicted head under `drop-oldest`, the
   * refused newcomer under `drop-new`. `reject` throws instead, so it never calls this. Use it to
   * make loss observable.
   */
  readonly onDrop?: (item: T) => void
}

/**
 * Build a {@link BoundedQueue} of `capacity` (must be `>= 1`). A waiting consumer is handed a
 * pushed item directly, so the buffer never grows past `capacity`. Pending consumers are bounded by
 * `maxWaiters`; an excess `pop` rejects with {@link QueueWaitersFullError}.
 */
export function createBoundedQueue<T>(
  capacity: number,
  options: BoundedQueueOptions<T> = {},
): BoundedQueue<T> {
  if (!isPositiveInteger(capacity)) {
    throw new RangeError("createBoundedQueue requires an integer capacity >= 1")
  }
  const maxWaiters = options.maxWaiters ?? capacity
  if (!isPositiveInteger(maxWaiters)) {
    throw new RangeError("createBoundedQueue requires an integer maxWaiters >= 1")
  }
  const overflow = options.overflow ?? "drop-oldest"
  if (overflow !== "drop-new" && overflow !== "drop-oldest" && overflow !== "reject") {
    throw new RangeError(
      'createBoundedQueue requires overflow to be "drop-new", "drop-oldest", or "reject"',
    )
  }
  // FIFO buffer with a moving `head`, so a pop is O(1) instead of re-indexing every remaining item;
  // the dead prefix is compacted only once it dominates.
  const buffer: T[] = []
  let head = 0
  const buffered = (): number => buffer.length - head
  const takeHead = (): T => {
    const value = buffer[head] as T
    buffer[head] = undefined as unknown as T
    head++
    if (head > 32 && head * 2 >= buffer.length) {
      buffer.splice(0, head)
      head = 0
    }
    return value
  }
  const waiters: Array<{ resolve: (value: T) => void; reject: (reason: unknown) => void }> = []
  let closed = false

  return {
    get size() {
      return buffered()
    },
    capacity,
    push(item: T): boolean {
      if (closed) {
        throw new QueueClosedError()
      }
      const waiter = waiters.shift()
      if (waiter !== undefined) {
        waiter.resolve(item)
        return true
      }
      if (buffered() >= capacity) {
        if (overflow === "reject") {
          throw new QueueFullError(capacity)
        }
        if (overflow === "drop-new") {
          options.onDrop?.(item)
          return false
        }
        const evicted = takeHead()
        buffer.push(item)
        options.onDrop?.(evicted)
        return true
      }
      buffer.push(item)
      return true
    },
    tryPop(): T | undefined {
      return buffered() > 0 ? takeHead() : undefined
    },
    pop(options?: { signal?: WebAbortSignal }): Promise<T> {
      if (buffered() > 0) {
        return Promise.resolve(takeHead())
      }
      if (closed) {
        return Promise.reject(new QueueClosedError())
      }
      const signal = options?.signal
      if (signal?.aborted) {
        return Promise.reject(new AbortError({ cause: signal.reason }))
      }
      if (waiters.length >= maxWaiters) {
        return Promise.reject(new QueueWaitersFullError(maxWaiters))
      }
      return new Promise<T>((resolve, reject) => {
        const waiter = {
          resolve: (value: T) => {
            signal?.removeEventListener("abort", onAbort)
            resolve(value)
          },
          reject: (reason: unknown) => {
            signal?.removeEventListener("abort", onAbort)
            reject(reason)
          },
        }
        const onAbort = () => {
          const index = waiters.indexOf(waiter)
          if (index !== -1) {
            waiters.splice(index, 1)
            reject(new AbortError({ cause: signal?.reason }))
          }
        }
        signal?.addEventListener("abort", onAbort, { once: true })
        waiters.push(waiter)
      })
    },
    close(): void {
      if (closed) {
        return
      }
      closed = true
      while (waiters.length > 0) {
        waiters.shift()?.reject(new QueueClosedError())
      }
    },
  }
}
