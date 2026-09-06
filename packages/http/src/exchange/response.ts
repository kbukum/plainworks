import type { WebHeaders } from "@plainworks/std"

/** A successful response with its body decoded (and optionally validated) to `T`. */
export interface HttpResponse<T> {
  /** HTTP status code (always a 2xx for a returned response). */
  readonly status: number
  /** Response headers. */
  readonly headers: WebHeaders
  /** Final URL of the response (after any redirects), falling back to the requested URL. */
  readonly url: string
  /** The decoded response body, or `undefined` for an empty/no-content (e.g. `204`) response. */
  readonly data: T | undefined
}
