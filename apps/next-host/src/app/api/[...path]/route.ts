// The mock backend route handler: it serves the app's task domain under `/api/*` by dispatching
// each request to the seeded `@plainworks/mocks` backend — a local API origin you own. Dynamic
// (never statically prerendered), so the seeded stores are live for both the RSC prefetch and the
// browser query. A real deployment swaps this route for the actual API origin; nothing above it
// changes.

import { demoBackend } from "../../../server/backend"
import { boundedRequest, PayloadTooLargeError, payloadTooLarge } from "../../../server/request-body"

export const dynamic = "force-dynamic"

async function handle(request: Request): Promise<Response> {
  try {
    return demoBackend().dispatch(await boundedRequest(request))
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return payloadTooLarge()
    }
    throw error
  }
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE }
