import type { AuthContext, AuthHeaderProvider, AuthHeaders, WebAbortSignal } from "@plainworks/std"

/** Controls for the fake built by {@link fakeAuthHeaderProvider}. */
export interface FakeAuthProvider {
  /** The {@link AuthHeaderProvider} to inject into the code under test. */
  readonly provider: AuthHeaderProvider
  /** How many times {@link FakeAuthProvider.provider} has been invoked. */
  readonly calls: number
  /** The abort signal passed via {@link AuthContext} on each call, in order (`undefined` when none). */
  readonly signals: ReadonlyArray<WebAbortSignal | undefined>
  /** Replace the headers the provider resolves with (or `undefined` to simulate unauthenticated). */
  setHeaders(headers: AuthHeaders | undefined): void
  /** Make the provider fail with `error`, or clear a previously set failure with `undefined`. */
  failWith(error: Error | undefined): void
}

/** Options for {@link fakeAuthHeaderProvider}. */
export interface FakeAuthOptions {
  /** Initial headers to resolve. Omit for an unauthenticated (`undefined`) provider. */
  readonly headers?: AuthHeaders
  /** When `true`, the provider resolves asynchronously (returns a promise), exercising the async seam. */
  readonly async?: boolean
}

/**
 * Build a controllable {@link AuthHeaderProvider} fake for transport/auth tests. The returned
 * handle lets a test swap the resolved headers, force a failure, assert how many times the provider
 * was called, and inspect the {@link AuthContext} `signal` each call received (so a test can prove a
 * transport forwards the attempt's cancellation to the credential seam) — without hand-rolling a
 * one-off stub.
 */
export function fakeAuthHeaderProvider(options: FakeAuthOptions = {}): FakeAuthProvider {
  let headers = options.headers
  let error: Error | undefined
  let calls = 0
  const signals: Array<WebAbortSignal | undefined> = []
  const isAsync = options.async ?? false

  const provider: AuthHeaderProvider = (context?: AuthContext) => {
    calls += 1
    signals.push(context?.signal)
    if (isAsync) {
      return error !== undefined ? Promise.reject(error) : Promise.resolve(headers)
    }
    if (error !== undefined) {
      throw error
    }
    return headers
  }

  return {
    provider,
    get calls() {
      return calls
    },
    get signals() {
      return signals
    },
    setHeaders(next: AuthHeaders | undefined) {
      headers = next
    },
    failWith(next: Error | undefined) {
      error = next
    },
  }
}
