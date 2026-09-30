// BFF logout route: a same-origin POST carrying the session-bound CSRF token (the client's
// `logout()` submits a hidden form). The request's origin and the token are both checked before the
// session is cleared, so a cross-site request cannot force a logout. The cleared cookie rides back
// on the redirect home.

import {
  createRequestJar,
  isSameOriginRequest,
  readFormBody,
  redirectToPath,
} from "@plainworks/auth/server"
import { PayloadTooLargeError } from "@plainworks/std/web"
import { hostAuth } from "../../server/identity-provider"
import { appOrigin } from "../../server/origin"
import { routeResponse } from "../../server/route-response"

export const dynamic = "force-dynamic"

export async function POST(request: Request): Promise<Response> {
  const origin = appOrigin()
  if (!isSameOriginRequest(request, origin)) {
    return new Response("Forbidden", { status: 403 })
  }
  let form: URLSearchParams
  try {
    form = await readFormBody(request)
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return new Response("Payload Too Large", { status: 413 })
    }
    throw error
  }
  const { auth } = await hostAuth()
  const { jar, cookies } = createRequestJar(request)
  const csrfToken = form.get("csrf") ?? request.headers.get("x-csrf-token") ?? ""
  if (!(await auth.session.verifyCsrf(jar, csrfToken))) {
    return new Response("Forbidden", { status: 403 })
  }
  await auth.session.logout(jar)
  return routeResponse(redirectToPath({ origin, path: "/", cookies }))
}
