import "server-only"

// The host's own absolute origin, resolved from deployment configuration — never from a forwardable
// request header. The RSC prefetch, the browser query, the OIDC redirect URI, and every BFF
// redirect and same-origin check use it, so one trusted origin serves every path.

import { parseAppOrigin } from "@plainworks/auth/server"

const DEFAULT_ORIGIN = "http://localhost:3000"

/** The configured application origin, or the local default when none is set. */
export function appOrigin(): string {
  return parseAppOrigin(
    process.env.APP_ORIGIN ?? process.env.AUTH_REDIRECT_ORIGIN ?? DEFAULT_ORIGIN,
  )
}
