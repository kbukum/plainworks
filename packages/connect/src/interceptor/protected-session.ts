import type { Interceptor } from "@connectrpc/connect"
import { AbortError, combineSignals, raceAbort } from "@plainworks/std/resilience"
import type { ProtectedSession } from "@plainworks/std/seam"
import type { WebAbortSignal } from "@plainworks/std/web"
import { injectedAuthHeadersKey } from "./auth-header"

/** Keep the borrowed lifetime through the complete unary call or streaming iterator. */
export function protectedSessionInterceptor(session: ProtectedSession): Interceptor {
  return (next) => async (request) => {
    const lease = await session.acquire({ signal: request.signal })
    const owner = new AbortController()
    const signal = combineSignals(request.signal, lease.signal, owner.signal)
    const header = new Headers(request.header)
    for (const [name, value] of Object.entries(lease.headers)) header.set(name, value)
    let released = false
    const release = (): void => {
      if (released) return
      released = true
      owner.abort()
      lease.release()
    }
    try {
      const response = await raceAbort(
        next({
          ...request,
          signal,
          header,
          contextValues: request.contextValues.set(injectedAuthHeadersKey, [
            ...request.contextValues.get(injectedAuthHeadersKey),
            ...Object.keys(lease.headers),
          ]),
        }),
        signal,
      )
      if (!response.stream) {
        release()
        return response
      }
      return { ...response, message: protectedMessages(response.message, signal, release) }
    } catch (cause) {
      release()
      throw cause
    }
  }
}

function protectedMessages<T>(
  messages: AsyncIterable<T>,
  signal: WebAbortSignal,
  release: () => void,
): AsyncIterable<T> {
  const iterator = messages[Symbol.asyncIterator]()
  let closed = false
  const close = (): void => {
    if (closed) return
    closed = true
    signal.removeEventListener("abort", close)
    release()
    void iterator.return?.().catch(() => {})
  }
  signal.addEventListener("abort", close, { once: true })
  if (signal.aborted) close()
  async function* iterate(): AsyncGenerator<T, void, unknown> {
    try {
      while (true) {
        if (signal.aborted) throw new AbortError({ cause: signal.reason })
        const item = await raceAbort(iterator.next(), signal)
        if (item.done) return
        yield item.value
      }
    } finally {
      close()
    }
  }
  return { [Symbol.asyncIterator]: iterate }
}
