// The mock backend route handler: it serves the app's task domain under `/api/*` by dispatching
// each request to the seeded `@plainworks/mocks` backend — a local API origin you own. Dynamic
// (never statically prerendered), so the seeded stores are live for both the RSC prefetch and the
// browser query. The dispatcher caps the request body, answering an oversized one with 413. Task
// mutations require the session's CSRF token. Mock control (`/api/mock/*`) is the development
// harness, not a user resource, so it bypasses the session and is never served in production. In
// development each request is served from its data scope (`server/backend.ts`), and
// `DELETE /api/mock/scope` drops it. A real deployment swaps this route for the actual API origin;
// nothing above it changes.

import { AuthError } from "@plainworks/auth"
import { authFailureResponse, createRequestJar } from "@plainworks/auth/server"
import { MOCK_CONTROL_PATHS } from "@plainworks/mocks/control"
import { MockScopeError } from "@plainworks/mocks/scope"
import { demoBackend, releaseDemoScope } from "../../../server/backend"
import { withHostAuth } from "../../../server/identity-provider"
import { routeResponse } from "../../../server/route-response"

export const dynamic = "force-dynamic"

const MOCK_CONTROL = "/api/mock/"
const MOCK_SCOPE = `/api${MOCK_CONTROL_PATHS.scope}`

function invalidScope(): Response {
  return Response.json(
    { type: "about:blank", title: "Invalid mock scope", status: 400 },
    { status: 400, headers: { "content-type": "application/problem+json" } },
  )
}

async function handle(request: Request): Promise<Response> {
  try {
    return await serve(request)
  } catch (cause) {
    if (cause instanceof MockScopeError) return invalidScope()
    throw cause
  }
}

async function serve(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url)
  if (pathname.startsWith(MOCK_CONTROL)) {
    if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 })
    if (pathname === MOCK_SCOPE && request.method === "DELETE") {
      releaseDemoScope(request.headers)
      return Response.json({ success: true })
    }
    return demoBackend(request.headers).dispatch(request)
  }
  // Resolve the scope before auth, so a malformed one answers 400 rather than an auth failure.
  const backend = demoBackend(request.headers)
  if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "OPTIONS") {
    try {
      return await withHostAuth(async ({ auth }) => {
        const { jar } = createRequestJar(request)
        if (!(await auth.session.verifyCsrf(jar, request.headers.get("x-csrf-token") ?? ""))) {
          return routeResponse(
            authFailureResponse(new AuthError("auth/csrf", "CSRF token rejected")),
          )
        }
        return backend.dispatch(request)
      })
    } catch (cause) {
      return routeResponse(authFailureResponse(cause))
    }
  }
  return backend.dispatch(request)
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE }
