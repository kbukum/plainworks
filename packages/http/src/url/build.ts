import type { WebURL } from "@plainworks/std"
import { HttpError } from "../error"
import { assertNoUrlCredentials, parseUrl } from "./guard"
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
