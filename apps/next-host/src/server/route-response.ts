import "server-only"

// Hand a kit-built response back to a Next route handler. The kit's public types name the portable
// `WebResponse` contract, while Next expects the host's `Response` type. At runtime they are the
// same object, since the kit builds it with the platform `Response` constructor, so an `instanceof`
// check narrows it without a cast and fails loudly if that ever stops being true.

import type { WebResponse } from "@plainworks/std/web"

/** Narrow a kit-built `WebResponse` to the host `Response` a route handler returns. */
export function routeResponse(response: WebResponse): Response {
  if (response instanceof Response) {
    return response
  }
  throw new TypeError("Expected a platform Response from the kit")
}
