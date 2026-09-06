import { PlainError, type PlainErrorOptions } from "@plainworks/std"

/**
 * Typed error raised by `@plainworks/state`. Extends the kit's {@link PlainError} so the whole graph
 * shares one error shape — a machine-readable `kind` discriminant and a preserved `cause`. Thrown
 * when `useStore` or `useStoreApi` is called outside the store's matching `<Provider>`, where there
 * is no per-request store to read from.
 */
export class StateError extends PlainError<"state/missing-provider"> {
  constructor(message: string, options?: PlainErrorOptions) {
    super("state/missing-provider", message, options)
  }
}
