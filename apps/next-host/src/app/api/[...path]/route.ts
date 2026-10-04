// The mock backend route handler: it serves the app's task domain under `/api/*` by dispatching
// each request to the seeded `@plainworks/mocks` backend — a local API origin you own. Dynamic
// (never statically prerendered), so the seeded stores are live for both the RSC prefetch and the
// browser query. The dispatcher caps the request body, answering an oversized one with 413. Task
// mutations require the session's CSRF token. Mock control (`/api/mock/*`) is the development
// harness, not a user resource, so it bypasses the session and is never served in production. A
// real deployment swaps this route for the actual API origin; nothing above it changes.

import { authFailureResponse, createRequestJar } from "@plainworks/auth/server"
import { demoBackend } from "../../../server/backend"
import { withHostAuth } from "../../../server/identity-provider"
import { routeResponse } from "../../../server/route-response"

export const dynamic = "force-dynamic"

const MOCK_CONTROL = "/api/mock/"

async function handle(request: Request): Promise<Response> {
  if (new URL(request.url).pathname.startsWith(MOCK_CONTROL)) {
    return process.env.NODE_ENV === "production"
      ? new Response(null, { status: 404 })
      : demoBackend().dispatch(request)
  }
  if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "OPTIONS") {
    try {
      return await withHostAuth(async ({ auth }) => {
        const { jar } = createRequestJar(request)
        if (!(await auth.session.verifyCsrf(jar, request.headers.get("x-csrf-token") ?? ""))) {
          return new Response(null, { status: 403 })
        }
        return demoBackend().dispatch(request)
      })
    } catch (cause) {
      return routeResponse(authFailureResponse(cause))
    }
  }
  return demoBackend().dispatch(request)
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE }
