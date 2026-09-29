import { PlainError, type PlainErrorOptions } from "@plainworks/std"

/**
 * A composition **context** error — a client binding or recipe hook was read outside the provider
 * that supplies it, so there is no per-request value to read from. Carries its own `kind`
 * (`app/missing-provider`), distinct from {@link AppConfigError}, so a JavaScript caller can tell a
 * missing-provider read apart from a setup mistake.
 */
export class AppContextError extends PlainError<"app/missing-provider"> {
  constructor(message: string, options?: PlainErrorOptions) {
    super("app/missing-provider", message, options)
  }
}
