import type { WebURL } from "@plainworks/std"
import { HttpError } from "../error"
import { applyQuery, assertNoCredentialQuery, type QueryParams } from "./query"

/** Inputs for {@link buildUrl}. */
export interface BuildUrlInput {
  /** Absolute base the path resolves against (e.g. `https://api.example.com/v1`). */
  readonly baseUrl?: string
  /** Path (relative to `baseUrl`) or a full absolute URL when `baseUrl` is omitted. */
  readonly path: string
  /** Typed query parameters to encode onto the URL. */
  readonly query?: QueryParams
}

/**
 * Build a request URL: resolve `path` against `baseUrl`, encode `query`, and refuse any
 * credential-shaped query parameter (header-only auth). Path joining is anchored so a relative
 * `path` never escapes the base's own path segment.
 */
export function buildUrl(input: BuildUrlInput): string {
  const url = resolve(input.baseUrl, input.path)
  assertNoUrlCredentials(url)
  if (input.query !== undefined) {
    applyQuery(url, input.query)
  }
  assertNoCredentialQuery(url)
  return url.toString()
}

/**
 * Revalidate an already-built request URL string immediately before it is sent. An interceptor runs
 * between {@link buildUrl} and the transport and can rewrite `request.url`, so the credential
 * guards are re-run on the final URL — userinfo credentials and credential-shaped query parameters
 * are rejected even when they were reintroduced downstream of the original build. A URL that no
 * longer parses is refused as fatal.
 */
export function assertSafeRequestUrl(rawUrl: string): void {
  const url = parseUrl(rawUrl)
  assertNoUrlCredentials(url)
  assertNoCredentialQuery(url)
}

/**
 * Reject a URL that embeds credentials in its userinfo (`https://user:pass@host`). Basic-auth in
 * the URL is a credential-in-URL just like a token in the query string — header-only auth forbids
 * both. The offending values are never echoed into the error message so they cannot leak through a
 * log.
 */
function assertNoUrlCredentials(url: WebURL): void {
  if (url.username !== "" || url.password !== "") {
    throw HttpError.unsafeUrl(
      "Refusing a URL that embeds credentials in its userinfo; send credentials in a header instead.",
    )
  }
}

function resolve(baseUrl: string | undefined, path: string): WebURL {
  if (baseUrl === undefined) {
    return parseUrl(path)
  }
  // Anchor resolution: a trailing slash on the base plus a leading-slash-stripped path keeps a
  // relative `path` under the base's path segment instead of replacing it.
  const base = parseUrl(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`)
  const relative = path.startsWith("/") ? path.slice(1) : path
  const resolved = parseUrl(relative, base)
  assertUnderBase(base, resolved)
  return resolved
}

/**
 * Parse a URL, mapping any failure to a fatal unsafe-url error. Neither the offending input nor the
 * raw parser error is carried onto the thrown error — a malformed URL can itself embed a password
 * or token, and the platform `TypeError` echoes the input verbatim in its message, so attaching it
 * as `cause` would leak that value through a log. The caller only learns that the supplied URL was
 * invalid.
 */
function parseUrl(url: string, base?: WebURL): WebURL {
  try {
    return new URL(url, base)
  } catch {
    throw HttpError.unsafeUrl("The supplied request URL is invalid.")
  }
}

/**
 * Enforce the anchoring guarantee: a resolved URL must stay on the base's origin and beneath the
 * base's path segment. Dot-segment traversal (`../admin`) that escapes the base — a path-confusion
 * attack against a hand-built path — is rejected as a fatal unsafe-url error rather than silently
 * hitting a sibling endpoint. The base pathname always ends in `/`, so a prefix check is exact.
 */
function assertUnderBase(base: WebURL, resolved: WebURL): void {
  if (resolved.origin !== base.origin || !resolved.pathname.startsWith(base.pathname)) {
    throw HttpError.unsafeUrl(
      "Refusing a request path that escapes the base URL's path segment; use a path anchored under the base.",
    )
  }
}
