import "server-only"

// The host's own absolute origin, resolved from validated deployment configuration — never from a
// forwardable request header. The RSC task prefetch and the browser query both read `/api/*`
// against it, and the OIDC redirect URI is built from it, so one trusted origin serves every path.
// Trusting `x-forwarded-host` here would let a caller point the server-side fetch at an arbitrary
// internal host, so the origin comes only from configuration a deployment controls.

const DEFAULT_ORIGIN = "http://localhost:3000"

/** The configured application origin, or the local default when none is set. */
export function appOrigin(): string {
  const configured = process.env.APP_ORIGIN ?? process.env.AUTH_REDIRECT_ORIGIN
  return configured === undefined ? DEFAULT_ORIGIN : validatedOrigin(configured)
}

/** Reject a misconfigured origin at read time rather than emitting a malformed base URL. */
function validatedOrigin(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`APP_ORIGIN must be an absolute http(s) URL, received: ${value}`)
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`APP_ORIGIN must use http(s), received: ${url.protocol}`)
  }
  return url.origin
}
