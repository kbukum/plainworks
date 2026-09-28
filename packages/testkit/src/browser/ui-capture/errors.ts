/**
 * What went wrong in `ui:capture` itself, as opposed to a flow that failed: bad arguments
 * (`usage`), a git command (`git`), capturing a base commit (`base`), or the host or test runner
 * (`harness`). Every kind exits with the harness code, never the failure code.
 */
export type UiCaptureErrorKind = "usage" | "git" | "base" | "harness"

/** A `ui:capture` harness error. Its message says what to do next. */
export class UiCaptureError extends Error {
  override readonly name = "UiCaptureError"
  readonly kind: UiCaptureErrorKind

  constructor(kind: UiCaptureErrorKind, message: string, options?: ErrorOptions) {
    super(message, options)
    this.kind = kind
  }
}
