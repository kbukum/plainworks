import { PlainError, type PlainErrorOptions } from "@plainworks/std"

/**
 * A binding **configuration** error, detected before any Provider or hook lookup happens — so it
 * carries its own `kind` (`state/invalid-config`), distinct from {@link StateError}'s
 * `state/missing-provider`, and a JavaScript caller can tell a setup mistake apart from a
 * missing-provider read. Thrown when a context is created without an initializer, or a
 * bring-your-own-store Provider is rendered without its required `store`.
 */
export class StateConfigError extends PlainError<"state/invalid-config"> {
  override readonly name: string = "StateConfigError"
  constructor(message: string, options?: PlainErrorOptions) {
    super("state/invalid-config", message, options)
  }
}
