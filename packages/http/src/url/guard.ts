import type { WebURL } from "@plainworks/std"
import { HttpError } from "../error"
import { assertNoCredentialQuery } from "./query"

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
export function assertNoUrlCredentials(url: WebURL): void {
  if (url.username !== "" || url.password !== "") {
    throw HttpError.unsafeUrl(
      "Refusing a URL that embeds credentials in its userinfo; send credentials in a header instead.",
    )
  }
}

/**
 * Parse a URL, mapping any failure to a fatal unsafe-url error. Neither the offending input nor the
 * raw parser error is carried onto the thrown error — a malformed URL can itself embed a password
 * or token, and the platform `TypeError` echoes the input verbatim in its message, so attaching it
 * as `cause` would leak that value through a log. The caller only learns that the supplied URL was
 * invalid.
 */
export function parseUrl(url: string, base?: WebURL): WebURL {
  try {
    return new URL(url, base)
  } catch {
    throw HttpError.unsafeUrl("The supplied request URL is invalid.")
  }
}
