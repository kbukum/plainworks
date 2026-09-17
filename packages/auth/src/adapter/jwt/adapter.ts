import type { AuthHeaders, Identity, WebFetch } from "@plainworks/std"
import { AuthError } from "../../errors"
import type { AuthAdapter, AuthAdapterDeps, AuthenticateRequest } from "../seam"
import { JWT_ADAPTER_KIND, type JwtAdapterConfig, jwtAlgorithms } from "./config"
import { createJwtVerifier } from "./verify"

const DEFAULT_HEADER = "Authorization"
const DEFAULT_SCHEME = "Bearer"
const DEFAULT_SUBJECT_CLAIM = "sub"

function resolveFetch(configured: WebFetch | undefined): WebFetch {
  if (configured !== undefined) {
    return configured
  }
  const candidate = (globalThis as { fetch?: WebFetch }).fetch
  if (typeof candidate !== "function") {
    throw new AuthError(
      "auth/config",
      "no global fetch is available; inject a jwt `fetch` for this runtime",
    )
  }
  return candidate
}

/**
 * Read the bearer credential from the configured header — header-only, never a URL/query string.
 */
function bearerFrom(
  headers: AuthHeaders | undefined,
  headerName: string,
  scheme: string,
): string | undefined {
  if (headers === undefined) {
    return undefined
  }
  const wanted = headerName.toLowerCase()
  // The scheme is untrusted config, so escape it before it becomes a RegExp — a raw `(` would
  // otherwise throw a SyntaxError at request time.
  const matcher = new RegExp(`^${escapeRegExp(scheme)}\\s+(.+)$`, "i")
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === wanted) {
      return matcher.exec(value)?.[1]
    }
  }
  return undefined
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * The stateless `jwt` bearer adapter: it resolves the caller by verifying an inbound JWT against
 * the provider JWKS (algorithms pinned, `alg: none` rejected), and implements only `authenticate` —
 * a direct-token backend needs no interactive login. It custodies nothing, so it stays on the
 * neutral `.` entry. An invalid, expired, or forged token resolves to `null` (unauthenticated); an
 * infrastructure fault (a JWKS outage) propagates as a typed `auth/adapter` error rather than being
 * masked as a 401 — matching the API-key adapter's behavior.
 */
export function jwtAdapter(config: JwtAdapterConfig, _deps: AuthAdapterDeps): AuthAdapter {
  const headerName = config.headerName ?? DEFAULT_HEADER
  const scheme = config.scheme ?? DEFAULT_SCHEME
  const subjectClaim = config.subjectClaim ?? DEFAULT_SUBJECT_CLAIM
  const verifier = createJwtVerifier({
    jwksUri: config.jwksUri,
    jwks: config.jwks,
    ...(config.jwksUri === undefined ? {} : { fetch: resolveFetch(config.fetch) }),
    issuer: config.issuer,
    audience: config.audience,
    algorithms: jwtAlgorithms(config),
    timeoutMs: config.timeoutMs,
    cooldownDurationMs: config.cooldownDurationMs,
  })

  return {
    id: JWT_ADAPTER_KIND,
    async authenticate(request: AuthenticateRequest): Promise<Identity | null> {
      const token = bearerFrom(request.headers, headerName, scheme)
      if (token === undefined) {
        return null
      }
      let claims: Awaited<ReturnType<typeof verifier.verifyAccessToken>>
      try {
        claims = await verifier.verifyAccessToken(token, request.signal)
      } catch (error) {
        // A bad credential is unauthenticated; an infrastructure fault (JWKS outage) is a typed
        // error the caller surfaces, never a silent deny.
        if (error instanceof AuthError && error.kind === "auth/token-invalid") {
          return null
        }
        throw error
      }
      const subject = claims[subjectClaim]
      if (typeof subject !== "string" || subject.length === 0) {
        return null
      }
      return { subject, claims }
    },
  }
}
