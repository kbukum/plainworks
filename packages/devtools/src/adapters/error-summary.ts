import { PlainError } from "@plainworks/std"

/**
 * Project an unknown thrown value to a bounded, non-payload category — never the caller-controlled
 * `message`. A `message` can carry arbitrary secret text (`new Error(secret)`, or a custom message
 * on a typed error) that the session sanitizer cannot mask, since it masks only token-shaped or
 * sensitively-keyed values, not bare prose. A {@link @plainworks/std!PlainError} reports a fixed
 * label because its public `kind` is caller-controlled. Allowlisted built-in errors report a fixed
 * class label; every other `Error` and non-Error value reports a fixed marker.
 */
export function describeErrorSafely(error: unknown): string {
  if (error instanceof PlainError) return "PlainError"
  if (error instanceof EvalError) return "EvalError"
  if (error instanceof RangeError) return "RangeError"
  if (error instanceof ReferenceError) return "ReferenceError"
  if (error instanceof SyntaxError) return "SyntaxError"
  if (error instanceof TypeError) return "TypeError"
  if (error instanceof URIError) return "URIError"
  if (error instanceof AggregateError) return "AggregateError"
  if (error instanceof Error) return "Error"
  return "Unknown error"
}
