// Header-only CSRF; successful revocation clears the opaque cookie with a 204 response.

import { authFailureResponse, createRequestJar, isSameOriginRequest } from "@plainworks/auth/server"
import { withHostAuth } from "../../../server/identity-provider"
import { appOrigin } from "../../../server/origin"
import { routeResponse } from "../../../server/route-response"

export const dynamic = "force-dynamic"

export async function POST(request: Request): Promise<Response> {
  const origin = appOrigin()
  if (!isSameOriginRequest(request, origin)) {
    return new Response("Forbidden", { status: 403 })
  }
  try {
    return await withHostAuth(async ({ auth }) => {
      const { jar, cookies } = createRequestJar(request)
      const csrfToken = request.headers.get("x-csrf-token") ?? ""
      if (!(await auth.session.verifyLogoutCsrf(jar, csrfToken))) {
        return new Response("Forbidden", { status: 403 })
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
