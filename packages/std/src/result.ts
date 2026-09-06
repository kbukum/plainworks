import { PlainError } from "./errors"

/** A successful result carrying its value. */
export interface Ok<T> {
  readonly ok: true
  readonly value: T
}

/** A failed result carrying its typed error. */
export interface Err<E> {
  readonly ok: false
  readonly error: E
}

/**
 * A typed success-or-failure value — the return shape for operations that fail as data rather than by throwing. `E` defaults to `Error`; narrow it to a discriminated error union where callers must handle each case.
 */
export type Result<T, E = Error> = Ok<T> | Err<E>

/** Build a successful {@link Result}. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value }
}

/** Build a failed {@link Result}. */
export function err<E>(error: E): Err<E> {
  return { ok: false, error }
}

/** Type guard narrowing a {@link Result} to its success branch. */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok
}

/** Type guard narrowing a {@link Result} to its failure branch. */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok
}

/**
 * Return the value of an `Ok`, or throw the failure. A non-`Error` failure is wrapped in a {@link PlainError} so the thrown value is always an Error with the original preserved as `cause`.
 *
 * @throws The `Err` error itself when it is an `Error`, otherwise a {@link PlainError} `std/unwrap` wrapping it as `cause`.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value
  }
  if (result.error instanceof Error) {
    throw result.error
  }
  throw new PlainError("std/unwrap", "Called unwrap on an Err result", { cause: result.error })
}

/** Return the value of an `Ok`, or `fallback` when the result is an `Err`. */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback
}
