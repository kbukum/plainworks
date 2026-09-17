import "server-only"

// Build a redirect response that carries the session cookies the auth flow minted. The BFF routes
// buffer each `Set-Cookie` on the jar, then hand them here to append to a `303 See Other` redirect
// — `303` forces the follow-up to `GET`, correct after both the login bounce and the logout POST.

import { NextResponse } from "next/server"
import { appOrigin } from "./origin"

/** Redirect to `location` (resolved against the configured host origin), appending each buffered `Set-Cookie`. */
export function redirectWithCookies(
  location: string,
  cookies: readonly string[],
  _request?: Request,
): NextResponse {
  const response = NextResponse.redirect(new URL(location, appOrigin()), 303)
  for (const cookie of cookies) {
    response.headers.append("set-cookie", cookie)
  }
  return response
}
