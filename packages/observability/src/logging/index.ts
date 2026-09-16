// Re-export-only barrel for the logging concern — a minimal typed logger seam plus the safe,
// redacting console platform default. No logic here; implementation lives in the concern modules.
export type {
  ConsoleLike,
  ConsoleLoggerOptions,
} from "./console"
export { consoleSink, createConsoleLogger } from "./console"
export type { LogFields, Logger, LoggerOptions, LogLevel, LogRecord, LogSink } from "./logger"
export { createLogger } from "./logger"
