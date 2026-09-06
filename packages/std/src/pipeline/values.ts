/**
 * Left-to-right value pipeline: thread `value` through each same-typed step in order. The synchronous counterpart to {@link composeInterceptors} for plain value transforms (e.g. building a request object before it is sent).
 */
export function pipeValues<T>(value: T, ...steps: ReadonlyArray<(input: T) => T>): T {
  return steps.reduce((accumulator, step) => step(accumulator), value)
}
