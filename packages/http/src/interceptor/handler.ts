import type { Handler, Interceptor, WebResponse } from "@plainworks/std"
import type { HttpRequest } from "../exchange/request"

/** The terminal step of the request pipeline: turn an {@link HttpRequest} into a `Response`. */
export type HttpHandler = Handler<HttpRequest, WebResponse>

/**
 * A request/response middleware. It wraps the next {@link HttpHandler}, so it can inject headers,
 * short-circuit, observe the outcome, or post-process — the first interceptor in a client's list is
 * the outermost (runs first, sees the result last). Built on the shared `std` interceptor combinator.
 */
export type HttpInterceptor = Interceptor<HttpRequest, WebResponse>
