import type { Transport } from "@connectrpc/connect"
import type { ProtectedSession } from "@plainworks/std/seam"
import { mapConnectError } from "../errors"

/** Map outside Connect's interceptor normalization so callers receive the shared typed failure. */
export function failureTransport(transport: Transport, session?: ProtectedSession): Transport {
  const failure = (cause: unknown): unknown => {
    const error = mapConnectError(cause)
    if (error.authentication !== undefined || error.reason === "AUTH_STORE_UNAVAILABLE") {
      session?.invalidate(error)
    }
    return error
  }
  return {
    async unary(...args) {
      try {
        return await transport.unary(...args)
      } catch (error) {
        throw failure(error)
      }
    },
    async stream(...args) {
      try {
        const response = await transport.stream(...args)
        return { ...response, message: failureMessages(response.message, failure) }
      } catch (error) {
        throw failure(error)
      }
    },
  }
}

async function* failureMessages<T>(
  messages: AsyncIterable<T>,
  failure: (cause: unknown) => unknown,
): AsyncIterable<T> {
  try {
    yield* messages
  } catch (error) {
    throw failure(error)
  }
}
