/** How serious a reported error is, ordered `warning < error < fatal`. */
export type ReportSeverity = "warning" | "error" | "fatal"

/** Caller-supplied context attached to a report. Fields are redacted before a backend sees them. */
export interface ReportContext {
  /** Severity of this occurrence; defaults to `"error"`. */
  readonly severity?: ReportSeverity
  /** Structured context (user id, route, release). Redacted before delivery. */
  readonly fields?: Readonly<Record<string, unknown>>
  /** Low-cardinality labels a backend can index or group by. Redacted before delivery. */
  readonly tags?: Readonly<Record<string, string>>
}

/** A descriptor-safe, redacted error view handed to a reporting backend. */
export interface ReportedError {
  readonly name: string
  readonly message: string
  readonly stack?: string
}

/** A normalized, redacted report ready for synchronous backend admission. */
export interface ReportEvent {
  readonly severity: ReportSeverity
  /** Error message after defense-in-depth redaction. */
  readonly message: string
  /** A sanitized error view. Custom properties and causes are omitted. */
  readonly error: ReportedError
  /** Redacted structured context. */
  readonly fields: Readonly<Record<string, unknown>>
  /** Redacted, copied labels. */
  readonly tags: Readonly<Record<string, string>>
  /** Epoch milliseconds from the injected clock. */
  readonly time: number
}

/**
 * A single error-reporting destination (a Sentry-style service, an internal collector). BYO: a
 * consumer implements this and registers it explicitly — there is no global registry or built-in
 * vendor. `enqueue` must synchronously admit the event to the backend's own bounded queue or throw;
 * the adapter owns remote-call timeouts, cancellation, draining, and shutdown.
 */
export interface ReporterBackend {
  /** Stable name used in `onBackendError` diagnostics. */
  readonly name: string
  enqueue(event: ReportEvent): void
}

/** A backend that rejected admission of a report, with the cause it threw. */
export interface ReportFailure {
  /** Stable name of the backend that rejected the event. */
  readonly backend: string
  /** The value the backend threw during synchronous admission. */
  readonly cause: unknown
}

/**
 * The outcome of a single {@link ErrorReporter.report} call. Fan-out always runs to completion, so
 * `delivered` counts the backends that admitted the event and `failures` lists those that rejected
 * it. A caller that supplied no `onBackendError` still has a mandatory, typed signal that a report
 * was partially or wholly lost.
 */
export interface ReportResult {
  /** Number of backends that admitted the event. */
  readonly delivered: number
  /** Backends that rejected admission; empty when every backend admitted the event. */
  readonly failures: readonly ReportFailure[]
}

/**
 * The error-reporting seam consumers depend on. `report` normalizes and redacts, then fans the
 * event out to every registered backend, and returns a {@link ReportResult} describing which
 * backends admitted or rejected it. A backend failure never escapes to the caller.
 */
export interface ErrorReporter {
  report(error: unknown, context?: ReportContext): ReportResult
}
