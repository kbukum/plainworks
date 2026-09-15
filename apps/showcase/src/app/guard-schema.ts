import type { StandardSchemaV1 } from "@plainworks/std"

/**
 * Build a {@link StandardSchemaV1} from a type-guard predicate so the `http` client validates an
 * untrusted response body at its boundary and narrows it to `Output` — a value that fails the guard
 * is rejected with a single issue instead of being trusted as a fabricated type. The app owns this
 * tiny helper (rather than reaching into `@plainworks/testkit`, which is test-only tooling) so its
 * runtime data path carries no test dependency.
 */
export function guardSchema<Output>(
  predicate: (value: unknown) => value is Output,
  message: string,
): StandardSchemaV1<unknown, Output> {
  return {
    "~standard": {
      version: 1,
      vendor: "showcase",
      validate: (value) => (predicate(value) ? { value } : { issues: [{ message }] }),
    },
  }
}
