// BFF callback route: the provider redirects here with the authorization `code` and `state`.
// The session flow verifies `state`/PKCE against the cookies from the login step, exchanges the
// code for tokens through the injected provider `fetch`, and mints the signed identity-only session
// cookie — all server-side. The browser is then redirected to its sanitized return target with the
// new session cookie attached; no token ever crosses to the client. A callback with no valid login
// transaction lands on the sign-in recovery page instead of failing.

import { completeCallback } from "../../../server/auth-callback"
import { redirectWithCookies } from "../../../server/bff-redirect"
import { requestJar } from "../../../server/cookie-jar"
import { hostAuth } from "../../../server/identity-provider"

export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  const { auth } = await hostAuth()
  const { jar, cookies } = requestJar(request)
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const location = await completeCallback(auth.session, jar, params)
  return redirectWithCookies(location, cookies, request)
}
