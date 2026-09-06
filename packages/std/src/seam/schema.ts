import { err, ok, type Result } from "../result"

/**
 * A Standard Schema v1 validator — the community-standard validation contract implemented by Zod, Valibot, ArkType, Effect Schema, and others through the `~standard` property. Owning it structurally here (rather than depending on `@standard-schema/spec`) keeps `@plainworks/std` zero-dependency while any such library's schema stays assignable by duck typing.
 *
 * It is the one validation seam every transport reuses to turn an untrusted decoded `unknown` into a typed value at a trust boundary: `http` validates a response body with it, and future `rest`/`graphql`/`query` layers apply the same contract to their own payloads. See the Standard Schema spec at https://standardschema.dev.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  /** The Standard Schema validation namespace this validator exposes. */
  readonly "~standard": StandardSchemaProps<Input, Output>
}

/** The validation properties a {@link StandardSchemaV1} carries under its `~standard` key. */
export interface StandardSchemaProps<Input, Output> {
  /** Version of the Standard Schema contract. Always `1`. */
  readonly version: 1
  /** Identifier of the library that produced the schema (e.g. `"zod"`, `"valibot"`). */
  readonly vendor: string
  /** Validate an untrusted value, returning the typed value or a list of issues. May be async. */
  readonly validate: (
    value: unknown,
  ) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>
  /** Phantom input/output types for static inference; never populated at runtime. */
  readonly types?: StandardSchemaTypes<Input, Output> | undefined
}

/** The outcome of a {@link StandardSchemaV1} validation: a typed value or a list of issues. */
export type StandardSchemaResult<Output> = StandardSchemaSuccess<Output> | StandardSchemaFailure

/** A successful validation carrying the parsed, typed value. */
export interface StandardSchemaSuccess<Output> {
  readonly value: Output
  readonly issues?: undefined
}

/** A failed validation carrying one or more issues; the parsed value is absent. */
export interface StandardSchemaFailure {
  readonly issues: ReadonlyArray<StandardSchemaIssue>
}

/** A single validation problem: a human-readable message plus an optional path to the offending value. */
export interface StandardSchemaIssue {
  readonly message: string
  readonly path?: ReadonlyArray<PropertyKey | StandardSchemaPathSegment> | undefined
}

/** A structured path segment within a {@link StandardSchemaIssue} path. */
export interface StandardSchemaPathSegment {
  readonly key: PropertyKey
}

/** Phantom carrier of a schema's static input/output types; never present at runtime. */
export interface StandardSchemaTypes<Input, Output> {
  readonly input: Input
  readonly output: Output
}

/**
 * Statically infer the validated output type of a {@link StandardSchemaV1}. Derived from the success branch of `validate` so it works even when a schema omits the optional `types` phantom.
 */
export type InferSchemaOutput<S extends StandardSchemaV1> = Extract<
  Awaited<ReturnType<S["~standard"]["validate"]>>,
  StandardSchemaSuccess<unknown>
>["value"]

/**
 * Run a {@link StandardSchemaV1} over an untrusted value at a trust boundary, normalizing its sync-or-async outcome into a {@link Result}: `ok(value)` with the parsed, typed value, or `err(issues)` with the validation issues. Transports reuse this to validate a decoded payload without re-implementing the `~standard` handshake, then map the issues onto their own typed error.
 */
export async function validateWithSchema<S extends StandardSchemaV1>(
  schema: S,
  value: unknown,
): Promise<Result<InferSchemaOutput<S>, ReadonlyArray<StandardSchemaIssue>>> {
  const result = await schema["~standard"].validate(value)
  if (result.issues !== undefined) {
    return err(result.issues)
  }
  return ok(result.value)
}

/**
 * The explicit, opt-in escape hatch for "I trust this wire": a {@link StandardSchemaV1} that performs no validation and returns the decoded value as `T`. The cast is unchecked, so this must be a deliberate choice at the call site — the safe default is to receive the decoded `unknown` and narrow it, or to pass a real schema. Prefer a real validator for any untrusted boundary (a server response, model output, or retrieved content).
 */
export function unsafePassthrough<T>(): StandardSchemaV1<unknown, T> {
  return {
    "~standard": {
      version: 1,
      vendor: "plainworks",
      validate: (value): StandardSchemaSuccess<T> => ({ value: value as T }),
    },
  }
}
