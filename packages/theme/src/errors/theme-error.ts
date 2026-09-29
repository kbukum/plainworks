import { PlainError, type PlainErrorOptions } from "@plainworks/std"

/**
 * Typed error raised by `@plainworks/theme`. Extends the kit's {@link PlainError} so the whole
 * graph shares one error shape — a machine-readable `kind` discriminant and a preserved `cause`.
 * Thrown when `useTheme` is called outside a `<ThemeProvider>`, where there is no per-request theme
 * to read from.
 */
export class ThemeError extends PlainError<"theme/missing-provider"> {
  constructor(message: string, options?: PlainErrorOptions) {
    super("theme/missing-provider", message, options)
  }
}
