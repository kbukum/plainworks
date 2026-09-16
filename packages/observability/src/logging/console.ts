import { createLogger, type Logger, type LoggerOptions, type LogRecord } from "./logger"

/** Console methods a structured logger writes to — one per level. Injectable for tests. */
export interface ConsoleLike {
  debug(...args: readonly unknown[]): void
  info(...args: readonly unknown[]): void
  warn(...args: readonly unknown[]): void
  error(...args: readonly unknown[]): void
}

/** Options for {@link createConsoleLogger} — the logger options minus the sink it supplies. */
export interface ConsoleLoggerOptions extends Omit<LoggerOptions, "sink"> {
  /** Console to write to; defaults to the host `console`. Inject one to capture output in a test. */
  readonly console?: ConsoleLike
}

/**
 * Resolve the runtime's `console` without assuming a host global at import time — the same
 * lazy-global feature-detection as `@plainworks/auth`'s Web Crypto resolver. `console` is present
 * on every target runtime (Node, browsers, workers, edge, React Native), but the portability shim
 * does not declare it, so this is the one place that reads it off `globalThis` and verifies the
 * four level methods before use.
 */
function resolveHostConsole(): ConsoleLike {
  const candidate = (globalThis as { console?: unknown }).console
  if (
    candidate !== undefined &&
    candidate !== null &&
    typeof (candidate as ConsoleLike).debug === "function" &&
    typeof (candidate as ConsoleLike).info === "function" &&
    typeof (candidate as ConsoleLike).warn === "function" &&
    typeof (candidate as ConsoleLike).error === "function"
  ) {
    return candidate as ConsoleLike
  }
  throw new TypeError(
    "No host console is available; pass options.console to build this logger off the host.",
  )
}

/**
 * A {@link LogSink} that writes each already-redacted record to the matching console method as one
 * structured argument, so a JSON console transport keeps the fields machine-parseable instead of
 * flattening them into a message string.
 */
export function consoleSink(target: ConsoleLike): (record: LogRecord) => void {
  return (record) => {
    target[record.level]({
      ...record.fields,
      level: record.level,
      message: record.message,
      time: record.time,
    })
  }
}

/**
 * The platform-default logger: a redacting structured {@link Logger} bound to the host `console`.
 * Records pass through {@link createLogger}'s defense-in-depth redaction before the sink writes
 * them. The host console is resolved lazily on first record, so building the logger touches no host
 * global; inject `console` to capture output and `clock` for deterministic timestamps.
 */
export function createConsoleLogger(options: ConsoleLoggerOptions = {}): Logger {
  const { console: injected, ...loggerOptions } = options
  let cached: ConsoleLike | undefined
  const target = (): ConsoleLike => (cached ??= injected ?? resolveHostConsole())
  return createLogger({
    ...loggerOptions,
    sink: (record) => {
      const output = target()
      output[record.level]({
        ...record.fields,
        level: record.level,
        message: record.message,
        time: record.time,
      })
    },
  })
}
