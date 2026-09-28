/**
 * What went wrong in `ui:check` itself, as opposed to a flow that failed: bad arguments (`usage`),
 * a git command (`git`), capturing a base commit (`base`), or the host or test runner (`harness`).
 * Every kind exits with the harness code, never the failure code.
 */
export type UiCheckErrorKind = "usage" | "git" | "base" | "harness"

/** A `ui:check` harness error. Its message says what to do next. */
export class UiCheckError extends Error {
  override readonly name = "UiCheckError"
  readonly kind: UiCheckErrorKind

  constructor(kind: UiCheckErrorKind, message: string, options?: ErrorOptions) {
    super(message, options)
    this.kind = kind
  }
}
