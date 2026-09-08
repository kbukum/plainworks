import { PlainError, type PlainErrorOptions } from "@plainworks/std"

/**
 * Typed error raised by `@plainworks/state`. Extends the kit's {@link PlainError} so the whole
 * graph shares one error shape — a machine-readable `kind` discriminant and a preserved `cause`.
 * Thrown when `useStore` or `useStoreApi` is called outside the store's matching `<Provider>`,
 * where there is no per-request store to read from.
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

/**
 * One field's persistence failure inside a multi-field patch write: the field `key` that failed and
 * the underlying `cause`. Carried by {@link StateSourceError.failures} so a caller can see exactly
 * which fields did not persist and why, rather than a single opaque error for the whole patch.
 */
export interface StateFieldFailure {
  /** The field key that failed to persist. */
  readonly key: string
  /** The underlying failure thrown by that field's backend. */
  readonly cause: unknown
}

/** Options for {@link StateSourceError}, adding the per-field {@link StateFieldFailure} list. */
export interface StateSourceErrorOptions extends PlainErrorOptions {
  /** For a multi-field patch failure: every field that failed, each with its own preserved cause. */
  readonly failures?: readonly StateFieldFailure[]
}

/**
 * A scoped-state **backend** failure — a {@link import("@plainworks/std").StateSource} could not
 * read, write, or (de)serialize its value: a corrupt persisted string that fails to parse, a Web
 * Storage quota rejection, or a cookie that exceeds its size budget. Carries its own `kind`
 * (`state/source`), distinct from the provider/config errors, and preserves the underlying `cause`,
 * so an untrusted persisted value never escapes as a fabricated result or a swallowed write.
 *
 * It doubles as the **aggregate** for a `createScopedObject` patch that fans a write across several
 * scopes: when one or more fields fail, {@link failures} lists each failed field key with its cause
 * (and `cause` holds the single failure when exactly one field failed), so no field error is
 * swallowed and a partial write never masquerades as a success.
 */
export class StateSourceError extends PlainError<"state/source"> {
  /** The per-field failures when this error aggregates a multi-field patch; `undefined` otherwise. */
  readonly failures?: readonly StateFieldFailure[]
  constructor(message: string, options?: StateSourceErrorOptions) {
    super("state/source", message, options)
    if (options?.failures !== undefined) {
      this.failures = options.failures
    }
  }
}
