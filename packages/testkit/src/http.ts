import type { WebFetch, WebRequestInit, WebResponse } from "@plainworks/std"

/**
 * One queued result for {@link fakeFetch}: a response to resolve, an error to reject with, or
 * `"hang"` for a call that never settles (to exercise a per-attempt timeout).
 */
export type FetchOutcome = WebResponse | Error | "hang"

/** A single recorded call made to the {@link fakeFetch} fake. */
export interface FetchCall {
  /** The URL the client passed to `fetch`, stringified (the seam accepts a `string` or `WebURL`). */
  readonly url: string
  /** The request init the client passed, if any. */
  readonly init: WebRequestInit | undefined
}

/**
 * The `fetch` shape the fake satisfies — the canonical {@link WebFetch} seam, so it is assignable
 * anywhere a transport takes a `fetch` without narrowing the input away from `string | WebURL`.
 */
export type FakeFetchImpl = WebFetch

/** The handle {@link fakeFetch} returns: the injectable `fetch` plus a record of every call. */
export interface FakeFetch {
  /** Inject this in place of the global `fetch`. */
  readonly fetch: FakeFetchImpl
  /** Every call made so far, in order. */
  readonly calls: ReadonlyArray<FetchCall>
}

/**
 * Build a deterministic `fetch` fake that plays back a queued sequence of outcomes and records each
 * call, so a transport test drives the network boundary without a real server. The nth call returns
 * the nth outcome; once the queue is exhausted the last outcome repeats, so a single response can
 * back an unbounded retry loop. An outcome of `"hang"` (or an exhausted empty queue) returns a
 * promise that never settles, letting a test exercise a per-attempt timeout; an `Error` outcome
 * rejects, simulating a transport fault. Typed as the {@link WebFetch} seam, so it is assignable to
 * any client's `fetch` seam without coupling the testkit to a specific transport.
 */
export function fakeFetch(outcomes: readonly FetchOutcome[]): FakeFetch {
  const calls: FetchCall[] = []
  const fetch: FakeFetchImpl = (input, init) => {
    // The seam accepts `string | WebURL`; record it as a string so a `WebURL` never leaks into the
    // recorded call shape.
    calls.push({ url: String(input), init })
    const outcome = outcomes[Math.min(calls.length - 1, outcomes.length - 1)]
    if (outcome === undefined || outcome === "hang") {
      return new Promise<WebResponse>(() => {})
    }
    if (outcome instanceof Error) {
      return Promise.reject(outcome)
    }
    return Promise.resolve(outcome)
  }
  return { fetch, calls }
}
