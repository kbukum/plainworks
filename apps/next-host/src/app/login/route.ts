// BFF login route: begin the OIDC Authorization Code + PKCE flow, then bounce the browser to the
// callback. Token custody stays entirely server-side — the state/PKCE cookies the flow mints ride
// back on this redirect, and the client never sees a token. The in-process mock provider approves
// without an interactive page, so this redirects straight to the callback rather than to a hosted
// login screen; a real provider would land the browser on its own login page here.

import { redirectWithCookies } from "../../server/bff-redirect"
import { requestJar } from "../../server/cookie-jar"
import { hostAuth } from "../../server/identity-provider"

export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  const { auth, idp } = await hostAuth()
  const { jar, cookies } = requestJar(request)
  const returnTo = new URL(request.url).searchParams.get("returnTo") ?? "/"
  const begin = await auth.session.beginLogin(jar, { returnTo })
  const { callbackUrl } = idp.authorize(begin.authorizationUrl)
  return redirectWithCookies(callbackUrl, cookies, request)
}
