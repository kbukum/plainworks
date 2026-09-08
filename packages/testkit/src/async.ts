/**
 * An externally-controlled promise: hand `promise` to the code under test, then resolve or reject
 * it from the test at the exact moment you want. Essential for exercising in-flight async paths —
 * single-flight refresh, timeouts, and reconnection — deterministically.
 */
export interface Deferred<T> {
  /** The pending promise handed to the code under test. */
  readonly promise: Promise<T>
  /** Settle {@link Deferred.promise} with `value`. */
  resolve(value: T | PromiseLike<T>): void
  /** Reject {@link Deferred.promise} with `reason`. */
  reject(reason?: unknown): void
}

/** Build a {@link Deferred}. The executor runs synchronously, so `resolve`/`reject` are ready immediately. */
export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/**
 * Drain the microtask queue for a bounded number of turns so already-resolved promises and their
 * `.then` chains run before the test asserts. Each await yields one turn; chains that keep queueing
 * new microtasks need one turn per link, so `turns` bounds how deep a chain this drains (default
 * 10) — it never waits indefinitely and never advances real time.
 */
export async function flushMicrotasks(turns = 10): Promise<void> {
  if (!Number.isSafeInteger(turns) || turns < 0) {
    throw new RangeError("flushMicrotasks requires a non-negative safe-integer turn bound")
  }
  for (let i = 0; i < turns; i++) {
    await Promise.resolve()
  }
}
