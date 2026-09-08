import type { RequestInput } from "../request-input"

/**
 * Per-call inputs for a resource read (`get`): every forwardable {@link RequestInput} knob — query,
 * headers, and the cancellation/resilience controls — minus the positional method/path, the
 * write-only body, the `idempotent` flag the resource layer owns, and the schema the typed
 * overloads add. Derived by **omission** from `RequestInput`, so a new request knob flows straight
 * through and the option contract can never drift from what `request` accepts (see the per-field
 * docs on `RequestInput`).
 */
export type ResourceReadOptions = Omit<
  RequestInput,
  "method" | "path" | "body" | "idempotent" | "schema"
>

/**
 * Per-call inputs for a resource write (`post`/`put`/`patch`/`delete`): the read knobs plus the
 * request body and an optional idempotency key. Also derived by **omission** from
 * {@link RequestInput}, so a new forwardable knob reaches writes automatically.
 */
export type ResourceWriteOptions = Omit<
  RequestInput,
  "method" | "path" | "idempotent" | "schema"
> & {
  /**
   * Idempotency key for a non-idempotent write. When set it is sent as the `Idempotency-Key` header
   * and marks the request retry-eligible. This is safe **only when the target endpoint honors the
   * header and dedupes the repeats server-side** — against a server that ignores it, an
   * auto-retried write can duplicate a partial success, so set it only for endpoints that guarantee
   * idempotency-key support. Omit it and a `POST`/`PATCH` is never auto-retried (a partial success
   * must not be duplicated). Generate the key **once per logical write** with `idempotencyKey()`
   * from `@plainworks/std` and reuse the same value across every retry.
   */
  readonly idempotencyKey?: string
}
