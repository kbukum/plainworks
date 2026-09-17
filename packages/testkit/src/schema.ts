import {
  type StandardSchemaIssue,
  type StandardSchemaResult,
  type StandardSchemaV1,
  guardSchema as stdGuardSchema,
} from "@plainworks/std"

/** Options shared by the schema fakes. */
export interface FakeSchemaOptions {
  /** Vendor label reported under `~standard.vendor`. Defaults to `"testkit"`. */
  readonly vendor?: string
  /** When `true`, `validate` resolves asynchronously (returns a promise), exercising the async seam. */
  readonly async?: boolean
}

/**
 * Build a {@link StandardSchemaV1} from a plain `validate` function for transport/validation tests
 * — a controllable Standard Schema without pulling in Zod/Valibot. The function returns either a
 * `{ value }` (accepted, typed) or `{ issues }` (rejected) result; set `async` to exercise the
 * promise-returning validate path.
 */
export function fakeSchema<Output>(
  validate: (
    value: unknown,
  ) => { readonly value: Output } | { readonly issues: ReadonlyArray<StandardSchemaIssue> },
  options: FakeSchemaOptions = {},
): StandardSchemaV1<unknown, Output> {
  const vendor = options.vendor ?? "testkit"
  const isAsync = options.async ?? false
  const run = (value: unknown): StandardSchemaResult<Output> => {
    const outcome = validate(value)
    return "issues" in outcome ? { issues: outcome.issues } : { value: outcome.value }
  }
  return {
    "~standard": {
      version: 1,
      vendor,
      validate: (value) => (isAsync ? Promise.resolve(run(value)) : run(value)),
    },
  }
}

/**
 * Build a {@link StandardSchemaV1} from a type-guard predicate. The runtime validation delegates to
 * `@plainworks/std`'s canonical constructor; testkit only adds a configurable vendor and async
 * mode.
 */
export function guardSchema<Output>(
  predicate: (value: unknown) => value is Output,
  message = "Value did not match the expected shape",
  options: FakeSchemaOptions = {},
): StandardSchemaV1<unknown, Output> {
  const schema = stdGuardSchema(predicate, message)
  const validate = schema["~standard"].validate
  const isAsync = options.async ?? false
  return {
    "~standard": {
      version: 1,
      vendor: options.vendor ?? "testkit",
      validate: (value) => {
        const result = validate(value)
        return isAsync ? Promise.resolve(result) : result
      },
    },
  }
}
