// Server-safe public entry for `@plainworks/observability` — re-export-only barrel over the neutral
// concerns: the logging seam + redacting console default, the error-reporting seam + fan-out hub,
// and the DOM-free Web Vitals shapes/rating. No React or DOM imports, so the `.` entry runs
// anywhere (Node, edge, RSC). The browser Web Vitals collector lives behind the `./client` entry.
export type {
  ConsoleLike,
  ConsoleLoggerOptions,
  LogFields,
  Logger,
  LoggerOptions,
  LogLevel,
  LogRecord,
  LogSink,
} from "./logging"
export { consoleSink, createConsoleLogger, createLogger } from "./logging"
export type {
  ErrorReporter,
  ErrorReporterHub,
  ErrorReporterOptions,
  ReportContext,
  ReportEvent,
  ReportedError,
  ReporterBackend,
  ReportFailure,
  ReportResult,
  ReportSeverity,
} from "./reporting"
export { createErrorReporter } from "./reporting"
export type {
  WebVitalMetric,
  WebVitalName,
  WebVitalRating,
  WebVitalReporter,
} from "./vitals"
export { rateWebVital } from "./vitals"
