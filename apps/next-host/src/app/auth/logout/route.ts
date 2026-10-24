// Header-only CSRF; a cross-origin request or a rejected token gets the session CSRF problem, and
// successful revocation clears the opaque cookie with a 204 response.

import { AuthError } from "@plainworks/auth"
import { authFailureResponse, createRequestJar, isSameOriginRequest } from "@plainworks/auth/server"
import { withHostAuth } from "../../../server/identity-provider"
import { appOrigin } from "../../../server/origin"
import { routeResponse } from "../../../server/route-response"

export const dynamic = "force-dynamic"

const csrfRejected = () =>
  routeResponse(authFailureResponse(new AuthError("auth/csrf", "logout proof rejected")))

export async function POST(request: Request): Promise<Response> {
  const origin = appOrigin()
  if (!isSameOriginRequest(request, origin)) {
    return csrfRejected()
  }
  try {
    return await withHostAuth(async ({ auth }) => {
      const { jar, cookies } = createRequestJar(request)
      const csrfToken = request.headers.get("x-csrf-token") ?? ""
      if (!(await auth.session.verifyLogoutCsrf(jar, csrfToken))) {
        return csrfRejected()
      }
      await auth.session.logout(jar)
      const headers = new Headers()
      for (const cookie of cookies) headers.append("set-cookie", cookie)
      return new Response(null, { status: 204, headers })
    })
  } catch (cause) {
    return routeResponse(authFailureResponse(cause))
  }
}
