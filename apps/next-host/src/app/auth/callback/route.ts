// BFF callback route: the provider redirects here with the authorization `code` and `state`. The
// session flow verifies `state`/PKCE against the login cookies, exchanges the code through the
// injected provider `fetch`, and mints the signed identity-only session cookie, all server-side.
// The browser then goes to its sanitized return target with the new cookie; no token reaches the
// client. A callback with no valid login transaction lands on the sign-in recovery page.

import { createRequestJar, redirectToPath } from "@plainworks/auth/server"
import { completeCallback } from "../../../server/auth-callback"
import { hostAuth } from "../../../server/identity-provider"
import { appOrigin } from "../../../server/origin"
import { routeResponse } from "../../../server/route-response"

export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  const { auth } = await hostAuth()
  const { jar, cookies } = createRequestJar(request)
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const path = await completeCallback(auth.session, jar, params)
  return routeResponse(redirectToPath({ origin: appOrigin(), path, cookies }))
}
