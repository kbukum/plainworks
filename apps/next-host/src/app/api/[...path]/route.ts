// The mock backend route handler: it serves the app's task domain under `/api/*` by dispatching
// each request to the seeded `@plainworks/mocks` backend — a local API origin you own. Dynamic
// (never statically prerendered), so the seeded stores are live for both the RSC prefetch and the
// browser query. The dispatcher caps the request body, answering an oversized one with 413. A real
// deployment swaps this route for the actual API origin; nothing above it changes.

import { demoBackend } from "../../../server/backend"

export const dynamic = "force-dynamic"

function handle(request: Request): Promise<Response> {
  return demoBackend().dispatch(request)
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE }
