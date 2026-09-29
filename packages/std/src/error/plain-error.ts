/**
 * Options accepted by every {@link PlainError}. `cause` preserves the original failure so a typed
 * error never discards the root of the problem.
 */
export interface PlainErrorOptions {
  readonly cause?: unknown
}

/**
 * Base typed error for the kit. Every package-specific error extends this so the whole graph shares
 * one shape: a machine-readable `kind` discriminant and a preserved `cause`. Never throw strings —
 * throw (or return) a `PlainError` (or a subclass) instead.
 *
 * `Kind` is a type parameter so a subclass can pin a literal union (e.g.
 * `PlainError<"http" | "parse">`) for exhaustive handling at the call site.
 */
export class PlainError<Kind extends string = string> extends Error {
  /** Stable, machine-readable discriminant for programmatic handling. */
  readonly kind: Kind

  constructor(kind: Kind, message: string, options?: PlainErrorOptions) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause })
    // `new.target` is the concrete constructor invoked, so a subclass reports its own name in stack
    // traces and logs instead of inheriting the literal "PlainError".
    this.name = new.target.name
    this.kind = kind
  }
}

/**
 * Normalize an unknown thrown value into an `Error`, preserving the original as `cause`. Use in
 * `catch` blocks where the caught value is typed `unknown`, so downstream code always has an Error.
 */
export function ensureError(value: unknown): Error {
  if (value instanceof Error) {
    return value
  }
  const message = typeof value === "string" ? value : "Unknown error thrown"
  return new PlainError("std/unknown", message, { cause: value })
}

/** Read a human-readable message from an unknown value without assuming its shape. */
export function getErrorMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message
  }
  if (typeof value === "string") {
    return value
  }
  return "Unknown error"
}
