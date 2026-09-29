// The `@plainworks/std` prelude: the vocabulary every module needs, whatever its concern.
// Typed errors and `Result`, plus the guards and assertions that narrow untrusted `unknown`.
// Each concern module is its own subpath (`@plainworks/std/web`, `@plainworks/std/time`) and is
// never re-exported here, so the import path names the concern. Re-export-only barrel.
export type { Err, ErrorSnapshot, Ok, PlainErrorOptions, Result } from "./errors"
export {
  createErrorSnapshot,
  ensureError,
  err,
  getErrorMessage,
  isErr,
  isOk,
  ok,
  PlainError,
  unwrap,
  unwrapOr,
} from "./errors"
export {
  assert,
  assertNever,
  hasProperty,
  isAbsentOr,
  isDefined,
  isNonEmptyString,
  isNonNegativeInteger,
  isOneOf,
  isPositiveInteger,
  isRecord,
} from "./guard"
