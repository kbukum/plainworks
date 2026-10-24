import type { Transport } from "@connectrpc/connect"
import type { ProtectedSession } from "@plainworks/std/seam"
import { mapConnectError, type RpcFailureDecoder } from "../errors"

/** Options for {@link failureTransport}. */
export interface FailureTransportOptions {
  /** Invalidated when a failure reports an ended or unverifiable session. */
  readonly session?: ProtectedSession | undefined
  /** Reads Connect error details. Defaults to the standard `google.rpc` model. */
  readonly failures?: RpcFailureDecoder | undefined
}

/** Map outside Connect's interceptor normalization so callers receive the shared typed failure. */
export function failureTransport(
  transport: Transport,
  options: FailureTransportOptions = {},
): Transport {
  const failure = (cause: unknown): unknown => {
    const error = mapConnectError(cause, options.failures)
    if (error.authentication !== undefined) options.session?.invalidate(error)
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
