import { type Clock, isRecord, redact, systemClock } from "@plainworks/std"

/** Severity of a log record, ordered `debug < info < warn < error`. */
export type LogLevel = "debug" | "info" | "warn" | "error"

/** Structured context attached to a log record. Values are redacted before they reach a sink. */
export interface LogFields {
  readonly [key: string]: unknown
}

/** A structured log entry after defense-in-depth redaction, ready for a {@link LogSink}. */
export interface LogRecord {
  readonly level: LogLevel
  readonly message: string
  /** Epoch milliseconds from the injected {@link Clock}. */
  readonly time: number
  readonly fields: LogFields
}

/** The one output seam a logger writes to. Inject a sink to route records anywhere. */
export type LogSink = (record: LogRecord) => void

/**
 * The minimal structured logger every consumer depends on. Methods return nothing and propagate
 * sink failures so operational errors remain visible. `child` derives a logger that carries extra
 * base fields on every record.
 */
export interface Logger {
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
  /** Derive a logger whose records always carry `fields`, merged under per-call fields. */
  child(fields: LogFields): Logger
}

/** Options for {@link createLogger}. */
export interface LoggerOptions {
  /** Where redacted records are written. */
  readonly sink: LogSink
  /** Time source for `record.time`; defaults to the host wall clock. */
  readonly clock?: Clock
  /** Drop records below this level; defaults to `"debug"` (emit everything). */
  readonly minLevel?: LogLevel
  /** Base fields merged into every record, under per-call fields. */
  readonly base?: LogFields
  /** Extra sensitive key names to redact beyond the built-in set. */
  readonly redactKeys?: readonly string[]
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

/**
 * Build a structured logger that redacts every record before it reaches the sink. The message and
 * the merged fields both pass through `std` {@link redact}, so recognizable token shapes and
 * sensitively-named fields are masked before the sink. Callers must still name or redact bare
 * secrets at the source. No module-level state — each call builds an independent logger.
 */
export function createLogger(options: LoggerOptions): Logger {
  const { sink } = options
  const clock = options.clock ?? systemClock
  const threshold = LEVEL_ORDER[options.minLevel ?? "debug"]
  const redactOptions = options.redactKeys !== undefined ? { keys: options.redactKeys } : {}

  const redactMessage = (message: string): string => {
    const redacted = redact(message, redactOptions)
    return typeof redacted === "string" ? redacted : "[REDACTED]"
  }
  const redactFields = (fields: LogFields): LogFields => {
    const redacted = redact(fields, redactOptions)
    return isRecord(redacted) ? redacted : {}
  }

  const build = (base: LogFields): Logger => {
    const emit = (level: LogLevel, message: string, fields?: LogFields): void => {
      if (LEVEL_ORDER[level] < threshold) {
        return
      }
      const merged = fields === undefined ? base : { ...base, ...fields }
      sink({
        level,
        message: redactMessage(message),
        time: clock.now(),
        fields: redactFields(merged),
      })
    }
    return {
      debug: (message, fields) => emit("debug", message, fields),
      info: (message, fields) => emit("info", message, fields),
      warn: (message, fields) => emit("warn", message, fields),
      error: (message, fields) => emit("error", message, fields),
      child: (fields) => build({ ...base, ...fields }),
    }
  }

  return build(options.base ?? {})
}
