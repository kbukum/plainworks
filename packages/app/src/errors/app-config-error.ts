import { PlainError, type PlainErrorOptions } from "@plainworks/std"

/**
 * A composition **configuration** error raised by `@plainworks/app`. Extends the kit's
 * {@link PlainError} so the whole graph shares one error shape (a machine-readable `kind`
 * discriminant and a preserved `cause`). It carries the single `app/invalid-config` kind across
 * every "the composition input is invalid" case:
 * - a **malformed capability registry**, detected while assembling the app before any render — two
 *   capabilities share an `id`, a capability depends on an unknown id, or the `dependsOn` graph has
 *   a cycle (including a self-dependency);
 * - a **malformed snapshot** at the SSR hydrate boundary — `deserializeSnapshot` received markup
 *   that is not valid JSON or is not a `{ capabilities }` object, and `serializeSnapshot` was
 *   handed a value that is not JSON-serializable.
 *
 * The kind stays uniform because all are "bad composition input"; read the message for the specific
 * case.
 */
export class AppConfigError extends PlainError<"app/invalid-config"> {
  constructor(message: string, options?: PlainErrorOptions) {
    super("app/invalid-config", message, options)
  }
}
