import {
  type Clock,
  createErrorSnapshot,
  isRecord,
  PlainError,
  redact,
  systemClock,
} from "@plainworks/std"
import type {
  ErrorReporter,
  ReportContext,
  ReportEvent,
  ReportedError,
  ReporterBackend,
  ReportFailure,
  ReportResult,
} from "./reporter"

/** Options for {@link createErrorReporter}. */
export interface ErrorReporterOptions {
  /** Backends registered up front; more can be added later via {@link ErrorReporterHub.register}. */
  readonly backends?: readonly ReporterBackend[]
  /** Time source for `event.time`; defaults to the host wall clock. */
  readonly clock?: Clock
  /** Extra sensitive key names to redact beyond the built-in set. */
  readonly redactKeys?: readonly string[]
  /**
   * Notified when a backend rejects an event synchronously. A failing backend never propagates to
   * the caller or stalls the other backends.
   */
  readonly onBackendError?: (error: unknown, backend: string) => void
}

/** An {@link ErrorReporter} that also lets a consumer register backends after construction. */
export interface ErrorReporterHub extends ErrorReporter {
  /**
   * Add a backend explicitly. Adapters register through this seam — never a global registry.
   *
   * @throws {PlainError} `observability/reporter` when a backend with the same `name` is already
   *   registered — silent duplicate registration would fan the same event out twice.
   */
  register(backend: ReporterBackend): void
}

/**
 * Build an error-reporting hub that normalizes and redacts each occurrence, then fans it out to the
 * registered backends. Redaction runs `std` {@link redact} over error and context fields before
 * any backend sees them. Callers must still name or redact bare secrets at the source.
 * A backend that rejects admission is isolated: its failure is recorded in the returned
 * {@link ReportResult} (and pushed to `onBackendError`) and never blocks the others or reaches the
 * caller. Delivery is synchronous and bounded by contract: backends enqueue into their own bounded
 * lifecycle rather than starting remote work in the hub. Duplicate backend names are rejected so a
 * report is never fanned out twice. No module-level state — each call builds an independent,
 * per-request hub.
 */
export function createErrorReporter(options: ErrorReporterOptions = {}): ErrorReporterHub {
  const clock = options.clock ?? systemClock
  const backends: ReporterBackend[] = []
  const onBackendError = options.onBackendError
  const redactOptions = options.redactKeys !== undefined ? { keys: options.redactKeys } : {}

  const register = (backend: ReporterBackend): void => {
    if (backends.some((existing) => existing.name === backend.name)) {
      throw new PlainError(
        "observability/reporter",
        `A reporter backend named '${backend.name}' is already registered`,
      )
    }
    backends.push(backend)
  }
  for (const backend of options.backends ?? []) {
    register(backend)
  }

  // The diagnostics callback is consumer code on the runtime path. If it throws, there is nowhere
  // safe to route the failure, so swallow it — a misbehaving callback must never break the
  // fire-and-forget contract or abort the remaining backends.
  const notifyBackendError = (cause: unknown, backend: string): void => {
    if (onBackendError === undefined) {
      return
    }
    try {
      onBackendError(cause, backend)
    } catch {
      // Intentionally ignored: a throwing error reporter cannot be reported through itself.
    }
  }

  const redactFields = (
    fields: Readonly<Record<string, unknown>>,
  ): Readonly<Record<string, unknown>> => {
    const redacted = redact(fields, redactOptions)
    return isRecord(redacted) ? redacted : {}
  }
  const redactTags = (tags: Readonly<Record<string, string>>): Readonly<Record<string, string>> => {
    const redacted = redact(tags, redactOptions)
    if (!isRecord(redacted)) {
      return {}
    }
    return Object.fromEntries(
      Object.entries(redacted).filter((entry): entry is [string, string] => {
        return typeof entry[1] === "string"
      }),
    )
  }
  const sanitizeError = (error: unknown): ReportedError => {
    const redacted = redact(createErrorSnapshot(error), redactOptions)
    const snapshot = isRecord(redacted) ? redacted : {}
    const name = typeof snapshot.name === "string" ? snapshot.name : "Error"
    const message = typeof snapshot.message === "string" ? snapshot.message : "Unknown error thrown"
    const stack = typeof snapshot.stack === "string" ? snapshot.stack : undefined
    return stack === undefined ? { name, message } : { name, message, stack }
  }

  return {
    register,
    report(error: unknown, context: ReportContext = {}): ReportResult {
      let event: ReportEvent
      try {
        const reportedError = sanitizeError(error)
        event = {
          severity: context.severity ?? "error",
          message: reportedError.message,
          error: reportedError,
          fields: redactFields(context.fields ?? {}),
          tags: redactTags(context.tags ?? {}),
          time: clock.now(),
        }
      } catch (cause) {
        notifyBackendError(cause, "reporter")
        return { delivered: 0, failures: [{ backend: "reporter", cause }] }
      }
      let delivered = 0
      const failures: ReportFailure[] = []
      for (const backend of [...backends]) {
        let backendName = "[unnamed]"
        try {
          backendName = backend.name
        } catch {
          // The configured backend is untrusted consumer code; retain a stable diagnostic label.
        }
        try {
          backend.enqueue(event)
          delivered += 1
        } catch (cause) {
          failures.push({ backend: backendName, cause })
          notifyBackendError(cause, backendName)
        }
      }
      return { delivered, failures }
    },
  }
}
