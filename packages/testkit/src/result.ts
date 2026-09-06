import { getErrorMessage, isErr, isOk, PlainError, type Result } from "@plainworks/std"

/**
 * Assert a {@link Result} is `Ok` and return its value, throwing a typed {@link PlainError} (with
 * the failure preserved as `cause`) otherwise. Lets a test read the success value directly instead
 * of manually narrowing.
 */
export function expectOk<T, E>(result: Result<T, E>): T {
  if (isErr(result)) {
    throw new PlainError(
      "testkit/expect-ok",
      `Expected an Ok result but got Err: ${getErrorMessage(result.error)}`,
      { cause: result.error },
    )
  }
  return result.value
}

/**
 * Assert a {@link Result} is `Err` and return its error, throwing a typed {@link PlainError}
 * otherwise. Lets a test assert on the failure branch directly.
 */
export function expectErr<T, E>(result: Result<T, E>): E {
  if (isOk(result)) {
    // The Ok value is an arbitrary generic — it may not survive serialization (bigint, circular
    // structures), so the message stays generic rather than risking a native TypeError here.
    throw new PlainError("testkit/expect-err", "Expected an Err result but got Ok")
  }
  return result.error
}
