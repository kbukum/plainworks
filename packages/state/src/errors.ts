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

/**
 * A binding **configuration** error, detected before any Provider or hook lookup happens — so it
 * carries its own `kind` (`state/invalid-config`), distinct from {@link StateError}'s
 * `state/missing-provider`, and a JavaScript caller can tell a setup mistake apart from a
 * missing-provider read. Thrown when a context is created without an initializer, or a
 * bring-your-own-store Provider is rendered without its required `store`.
 */
export class StateConfigError extends PlainError<"state/invalid-config"> {
  constructor(message: string, options?: PlainErrorOptions) {
    super("state/invalid-config", message, options)
  }
}
