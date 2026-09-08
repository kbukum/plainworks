/**
 * An async operation from an input to an output — the terminal step an interceptor chain wraps
 * (e.g. the `fetch` call at the end of a request pipeline).
 */
export type Handler<In, Out> = (input: In) => Promise<Out>

/**
 * Middleware that wraps the next {@link Handler}: it receives `next` and returns a new handler, so
 * it can inspect/transform the input, short-circuit, or post-process the output. The first
 * interceptor in a composed list is the outermost — it runs first and sees the result last.
 */
export type Interceptor<In, Out> = (next: Handler<In, Out>) => Handler<In, Out>

/**
 * Fold an ordered list of {@link Interceptor}s into one. Applying the result to a terminal handler
 * yields the fully wrapped handler; the list's first entry ends up outermost.
 */
export function composeInterceptors<In, Out>(
  interceptors: readonly Interceptor<In, Out>[],
): Interceptor<In, Out> {
  return (terminal) =>
    interceptors.reduceRight<Handler<In, Out>>((next, interceptor) => interceptor(next), terminal)
}
