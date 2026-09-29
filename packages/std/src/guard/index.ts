/**
 * Runtime type-narrowing primitives: boolean type-predicate guards ({@link isDefined},
 * {@link isRecord}, {@link isNonEmptyString}, {@link hasProperty}, {@link isPositiveInteger}) and
 * their throwing counterparts, the assertion functions ({@link assert}, {@link assertNever}).
 * Written once here at L0 so every layer narrows untrusted `unknown` the same way. Re-export-only
 * barrel; implementation lives in the concern-named modules beside it.
 */
export { assert, assertNever } from "./assert"
export { isNonNegativeInteger, isPositiveInteger } from "./number"
export {
  hasProperty,
  isAbsentOr,
  isDefined,
  isNonEmptyString,
  isOneOf,
  isRecord,
} from "./predicate"
