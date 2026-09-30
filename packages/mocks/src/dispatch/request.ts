import { isPositiveInteger } from "@plainworks/std"
import { PayloadTooLargeError, readBoundedBytes } from "@plainworks/std/web"
import { getResponse, type RequestHandler } from "msw"

/** The default request body cap for mock dispatch: 1 MiB. */
export const DEFAULT_MOCK_BODY_BYTES: number = 1024 * 1024

/** Options for {@link dispatchMockRequest}. */
export interface DispatchMockRequestOptions {
  /**
   * The most request-body bytes to buffer before a handler runs. A larger body is answered with
   * `413` and never reaches a handler. Defaults to {@link DEFAULT_MOCK_BODY_BYTES}.
   */
  readonly maxBodyBytes?: number
}

/**
 * Resolve a Web `Request` against MSW handlers without starting an interception server.
 *
 * The request body is read with a byte cap first, so an oversized or endless body never exhausts
 * memory: it is answered with a JSON `413`. The buffered request keeps the caller's abort signal.
 * Returns `undefined` when no handler matches, so the host decides whether to pass through or
 * answer with a terminal response.
 *
 * @throws {RangeError} When `maxBodyBytes` is not a positive safe integer.
 */
export async function dispatchMockRequest(
  request: Request,
  handlers: readonly RequestHandler[],
  options: DispatchMockRequestOptions = {},
): Promise<Response | undefined> {
  const maxBytes = options.maxBodyBytes ?? DEFAULT_MOCK_BODY_BYTES
  if (!isPositiveInteger(maxBytes)) {
    throw new RangeError("dispatchMockRequest: maxBodyBytes must be a positive safe integer")
  }
  let bounded: Request
  try {
    bounded = await boundedRequest(request, maxBytes)
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return Response.json({ error: "Request body too large" }, { status: 413 })
    }
    throw error
  }
  return getResponse([...handlers], bounded)
}

async function boundedRequest(request: Request, maxBytes: number): Promise<Request> {
  if (request.body === null) {
    return request
  }
  const bytes = await readBoundedBytes(request.body, { maxBytes, signal: request.signal })
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    signal: request.signal,
    ...(bytes.byteLength > 0 ? { body: bytes } : {}),
  })
}
