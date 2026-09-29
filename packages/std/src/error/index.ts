// Re-export-only barrel for the error concern: the kit's typed error base, unknown-value
// normalization, inert diagnostic snapshots, and the `Result` return type for expected failures.
export type { PlainErrorOptions } from "./plain-error"
export { ensureError, getErrorMessage, PlainError } from "./plain-error"
export type { Err, Ok, Result } from "./result"
export { err, isErr, isOk, ok, unwrap, unwrapOr } from "./result"
export type { ErrorSnapshot } from "./snapshot"
export { createErrorSnapshot } from "./snapshot"
