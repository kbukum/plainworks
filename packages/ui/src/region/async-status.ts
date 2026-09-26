/** The one view an async region shows at a time. */
export type AsyncStatus = "pending" | "error" | "empty" | "ready"

/** The read flags {@link asyncStatus} folds into one {@link AsyncStatus}. */
export interface AsyncFlags {
  /** The first read is still in flight. */
  readonly pending: boolean
  /** The read failed. */
  readonly error?: boolean
  /** The read succeeded with nothing to show. */
  readonly empty?: boolean
}

/**
 * Fold read flags into the single view to show. Failure outranks loading, so a failed read is never
 * shown as a spinner; loading outranks empty, so a blank result waits for the read to settle.
 */
export function asyncStatus({ pending, error = false, empty = false }: AsyncFlags): AsyncStatus {
  if (error) return "error"
  if (pending) return "pending"
  if (empty) return "empty"
  return "ready"
}
