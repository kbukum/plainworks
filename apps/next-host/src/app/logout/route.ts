// BFF logout route: a POST carrying the session-bound CSRF token (the client's `logout()` submits a
// hidden form). The token is verified against the session cookie before the session is cleared, so
// a cross-site navigation cannot force a logout. The cleared cookie rides back on the redirect
// home.

import { NextResponse } from "next/server"
import { redirectWithCookies } from "../../server/bff-redirect"
import { requestJar } from "../../server/cookie-jar"
import { hostAuth } from "../../server/identity-provider"
import { PayloadTooLargeError, payloadTooLarge, readBoundedText } from "../../server/request-body"

export const dynamic = "force-dynamic"

export async function POST(request: Request): Promise<Response> {
  const { auth } = await hostAuth()
  const { jar, cookies } = requestJar(request)
  let body: string
  try {
    body = await readBoundedText(request)
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return payloadTooLarge()
    }
    throw error
  }
  const params = new URLSearchParams(body)
  const csrfToken = params.get("csrf") ?? request.headers.get("x-csrf-token") ?? ""
  const valid = await auth.session.verifyCsrf(jar, csrfToken)
  if (!valid) {
    return new NextResponse("Forbidden", { status: 403 })
  }
  await auth.session.logout(jar)
  return redirectWithCookies("/", cookies, request)
}
