// Re-export-only barrel for the error-reporting concern — the reporter seam, backend contract, and
// the fan-out hub with explicit backend registration. No logic here.
export type { ErrorReporterHub, ErrorReporterOptions } from "./hub"
export { createErrorReporter } from "./hub"
export type {
  ErrorReporter,
  ReportContext,
  ReportEvent,
  ReportedError,
  ReporterBackend,
  ReportFailure,
  ReportResult,
  ReportSeverity,
} from "./reporter"
