import { PlainError } from "../errors"

/**
 * Throw a {@link PlainError} unless `condition` holds. As a TypeScript assertion, it also narrows
 * the checked value for the rest of the scope.
 *
 * @throws {PlainError} `std/assert` with `message` when `condition` is falsy.
 */
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new PlainError("std/assert", message)
  }
}

/**
 * Exhaustiveness guard for discriminated unions: place in the `default` branch so the compiler
 * flags an unhandled case, and fail loudly if an unexpected value slips through at runtime.
 *
 * @throws {PlainError} `std/assert` always — reaching it at runtime means an unhandled case slipped
 *   through.
 */
export function assertNever(value: never, message = "Unexpected value"): never {
  throw new PlainError("std/assert", `${message}: ${String(value)}`)
}
