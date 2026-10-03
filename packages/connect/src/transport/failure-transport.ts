import type { Transport } from "@connectrpc/connect"
import { mapConnectError } from "../errors"

/** Map outside Connect's interceptor normalization so callers receive the shared typed failure. */
export function failureTransport(transport: Transport): Transport {
  return {
    async unary(...args) {
      try {
        return await transport.unary(...args)
      } catch (error) {
        throw mapConnectError(error)
      }
    },
    async stream(...args) {
      try {
        const response = await transport.stream(...args)
        return { ...response, message: failureMessages(response.message) }
      } catch (error) {
        throw mapConnectError(error)
      }
    },
  }
}

async function* failureMessages<T>(messages: AsyncIterable<T>): AsyncIterable<T> {
  try {
    yield* messages
  } catch (error) {
    throw mapConnectError(error)
  }
}
