import type { WebHeaders, WebHeadersInit } from "@plainworks/std"
import type { HttpMethod } from "./http-method"

/** Methods that are idempotent by definition — safe to retry because repeating them has no extra effect. */
const IDEMPOTENT_METHODS: ReadonlySet<HttpMethod> = new Set<HttpMethod>([
  "GET",
  "HEAD",
  "PUT",
  "DELETE",
  "OPTIONS",
])

/**
 * Whether `method` is idempotent, which is the default retry-eligibility signal: a `POST`/`PATCH`
 * is never retried automatically (a partial success could be duplicated) unless a caller explicitly
 * opts in per request.
 */
export function isIdempotentMethod(method: HttpMethod): boolean {
  return IDEMPOTENT_METHODS.has(method)
}

/** The header that carries an idempotency key so a server can dedupe a repeated write. */
export const IDEMPOTENCY_KEY_HEADER = "idempotency-key"

/**
 * Merge an idempotency key into a set of request headers. A non-idempotent write (`POST`/`PATCH`)
 * that carries this header is safe to retry **only when the target endpoint honors the key and
 * dedupes the repeats server-side** — against a server that ignores it, an auto-retried write can
 * duplicate a partial success. When that precondition holds the shared retry driver may repeat the
 * write without duplicating its effect. Generate the key **once per logical write** with
 * `idempotencyKey()` from `@plainworks/std` and reuse it across every retry.
 */
export function withIdempotencyKey(headers: WebHeadersInit | undefined, key: string): WebHeaders {
  const merged = new Headers(headers)
  merged.set(IDEMPOTENCY_KEY_HEADER, key)
  return merged
}
