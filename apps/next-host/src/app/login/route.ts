// BFF login route: begin the OIDC Authorization Code + PKCE flow, then bounce the browser to the
// callback. Token custody stays server-side: the state/PKCE cookies the flow mints ride back on
// this redirect, and the client never sees a token. The in-process mock provider approves without
// an interactive page, so this redirects straight to the callback; a real provider would show its
// own login page here.

import { createRequestJar, redirectToUrl } from "@plainworks/auth/server"
import { hostAuth } from "../../server/identity-provider"
import { routeResponse } from "../../server/route-response"

export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  const { auth, idp } = await hostAuth()
  const { jar, cookies } = createRequestJar(request)
  const returnTo = new URL(request.url).searchParams.get("returnTo") ?? "/"
  const begin = await auth.session.beginLogin(jar, { returnTo })
  const { callbackUrl } = idp.authorize(begin.authorizationUrl)
  return routeResponse(redirectToUrl(callbackUrl, cookies))
}
