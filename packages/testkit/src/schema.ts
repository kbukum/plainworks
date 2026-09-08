import type { StandardSchemaIssue, StandardSchemaResult, StandardSchemaV1 } from "@plainworks/std"

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
 * Build a {@link StandardSchemaV1} from a type-guard predicate: a value that satisfies `predicate`
 * is accepted and narrowed to `Output`; anything else is rejected with a single issue carrying
 * `message`. Handy for asserting both the accept and reject paths of a validated boundary.
 */
export function guardSchema<Output>(
  predicate: (value: unknown) => value is Output,
  message = "Value did not match the expected shape",
  options?: FakeSchemaOptions,
): StandardSchemaV1<unknown, Output> {
  return fakeSchema<Output>(
    (value) => (predicate(value) ? { value } : { issues: [{ message }] }),
    options,
  )
}
