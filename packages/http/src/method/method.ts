/** The HTTP methods the client understands. */
export type HttpMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS"

/** Methods that are idempotent by definition — safe to retry because repeating them has no extra effect. */
const IDEMPOTENT_METHODS: ReadonlySet<HttpMethod> = new Set<HttpMethod>([
  "GET",
  "HEAD",
  "PUT",
  "DELETE",
  "OPTIONS",
])

/**
 * Whether `method` is idempotent, which is the default retry-eligibility signal: a `POST`/`PATCH` is never retried automatically (a partial success could be duplicated) unless a caller explicitly opts in per request.
 */
export function isIdempotentMethod(method: HttpMethod): boolean {
  return IDEMPOTENT_METHODS.has(method)
}
