import type { WebAbortSignal, WebBodyInit, WebHeaders, WebRequestInit } from "@plainworks/std/web"
import type { HttpMethod } from "../method"

/**
 * The request unit that flows through the interceptor chain to the terminal `fetch`. Interceptors
 * treat it as immutable — they return a modified copy (e.g. with added auth headers) rather than
 * mutating in place — so each retry attempt starts from the same base request.
 */
export interface HttpRequest {
  readonly method: HttpMethod
  readonly url: string
  readonly headers: WebHeaders
  readonly body?: WebBodyInit
  readonly signal?: WebAbortSignal
  /** Header names injected by credential/session middleware, retained through rewrites. */
  readonly credentialHeaders?: readonly string[]
}

/** Project an {@link HttpRequest} onto the `fetch` `RequestInit` shape. */
export function toRequestInit(request: HttpRequest): WebRequestInit {
  const init: WebRequestInit = { method: request.method, headers: request.headers }
  if (request.body !== undefined) {
    init.body = request.body
  }
  if (request.signal !== undefined) {
    init.signal = request.signal
  }
  return init
}
