import { isSensitiveKey, type WebURL } from "@plainworks/std"
import { HttpError } from "../error"

/** A single query-parameter value. */
export type QueryValue = string | number | boolean

/**
 * Typed query parameters. A value may repeat (array → repeated key); `null`/`undefined` values are
 * skipped so an absent parameter is simply omitted rather than serialized as an empty string.
 */
export type QueryParams = Readonly<
  Record<string, QueryValue | readonly QueryValue[] | null | undefined>
>

/**
 * Reject a query key that names a credential — credentials must travel in a header (header-only
 * auth), never the query string. The credential vocabulary is the shared `std` {@link isSensitiveKey}
 * predicate (separator-insensitive substring matching), so `X-Api-Key`, `access_token`, and
 * `apiKey` are all caught and the rule never drifts from the redaction vocabulary it mirrors.
 */
function assertSafeQueryKey(key: string): void {
  if (isSensitiveKey(key)) {
    // The key name is not echoed: a credential-shaped parameter key can itself be sensitive, and a
    // static message keeps the guard from leaking any part of the URL into a log.
    throw HttpError.unsafeUrl(
      "Refusing to put a credential-shaped query parameter in a URL; send credentials in a header instead.",
    )
  }
}

/** Append `params` to `url`'s query string with correct encoding, rejecting any credential-shaped key. */
export function applyQuery(url: WebURL, params: QueryParams): void {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue
    }
    assertSafeQueryKey(key)
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item))
      }
    } else {
      url.searchParams.set(key, String(value))
    }
  }
}

/** Reject a URL that already carries a credential-shaped query parameter (e.g. baked into the path). */
export function assertNoCredentialQuery(url: WebURL): void {
  for (const key of url.searchParams.keys()) {
    assertSafeQueryKey(key)
  }
}
