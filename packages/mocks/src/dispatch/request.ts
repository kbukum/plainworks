import { getResponse, type RequestHandler } from "msw"

/**
 * Resolve a Web `Request` against MSW handlers without starting an interception server.
 *
 * Returns `undefined` when no handler matches so the host decides whether to pass through or
 * answer with a terminal response.
 */
export function dispatchMockRequest(
  request: Request,
  handlers: readonly RequestHandler[],
): Promise<Response | undefined> {
  return getResponse([...handlers], request)
}
