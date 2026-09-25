import type {
  LogRecord,
  ReportEvent,
  ReporterBackend,
  WebVitalMetric,
  WebVitalReporter,
} from "@plainworks/observability"
import { assertTimerMs } from "@plainworks/std"
import type { Json } from "../../privacy"
import type { Severity } from "../../protocol"
import { createEventSampler } from "../../retention"
import { assertPositiveCapacity } from "../../retention/capacity"
import type { Source, SourceHandle } from "../../source"
import { createObserverRelay, observeSafely } from "../observer-relay"

/** Options for {@link createObservabilitySource}. */
export interface ObservabilitySourceOptions {
  /**
   * Stable identity for this observability wiring. Required whenever an app composes more than one
   * — the adapter never guesses identity from runtime state.
   */
  readonly instance: string
  /** Display label; defaults to `Observability <instance>`. */
  readonly label?: string
  /** Clock for event and indicator timestamps. Defaults to `Date.now`. */
  readonly now?: () => number
  /**
   * Coalescing interval for high-frequency logs, in milliseconds. A burst collapses to one log
   * event per interval while the running counts stay exact. Defaults to 250; `0` emits every log.
   */
  readonly logIntervalMs?: number
  /**
   * Field names captured from an already-redacted log record into on-demand detail. **Metadata is
   * the default** — with no allowlist, only the level and message are surfaced. The session's
   * redaction still runs over captured fields.
   */
  readonly captureLogFields?: readonly string[]
  /** Log records retained for on-demand detail before the oldest is evicted. Defaults to 50. */
  readonly detailCapacity?: number
}

/** The source plus the three tee seams a host composes with its operational observability. */
export interface ObservabilityInstrumentation {
  /** Register this with a {@link @plainworks/devtools!DevtoolsSession}. */
  readonly source: Source
  /**
   * A {@link @plainworks/observability!LogSink} to add alongside the operational sink. It only
   * reads the already-redacted record and never throws, so a fault here cannot break the logger or
   * the application path.
   */
  readonly logSink: (record: LogRecord) => void
  /** A {@link @plainworks/observability!ReporterBackend} to register beside the real backends. */
  readonly reporterBackend: ReporterBackend
  /** A {@link @plainworks/observability!WebVitalReporter} to tee measurements into the timeline. */
  readonly vitalReporter: WebVitalReporter
}

const DEFAULT_LOG_INTERVAL_MS = 250
const DEFAULT_DETAIL_CAPACITY = 50

/**
 * Tee an `@plainworks/observability` pipeline into a devtools source. The three returned seams are
 * added *beside* the operational logger, reporter, and vitals collector; each only reads the
 * already-redacted output and is wrapped so a devtools-side fault is swallowed — a failing tee
 * never alters the operational sink, the report result, or the application path. It is a local
 * diagnostic mirror, never a production telemetry pipeline: retention is bounded and only metadata
 * crosses the boundary by default.
 */
export function createObservabilitySource(
  options: ObservabilitySourceOptions,
): ObservabilityInstrumentation {
  const now = options.now ?? Date.now
  const label = options.label ?? `Observability ${options.instance}`
  const relay = createObserverRelay()
  const allow = options.captureLogFields
  const detailCapacity = options.detailCapacity ?? DEFAULT_DETAIL_CAPACITY
  const logIntervalMs = options.logIntervalMs ?? DEFAULT_LOG_INTERVAL_MS
  assertPositiveCapacity("Observability detail capacity", detailCapacity)
  assertTimerMs(logIntervalMs)
  const details = new Map<string, Json>()
  const counts = { logs: 0, logErrors: 0, reports: 0 }
  let detailCounter = 0

  const logSampler = createEventSampler({
    intervalMs: logIntervalMs,
    mode: "coalesce",
    // The trailing timer fires outside the `logSink`'s own `observeSafely`, so a throwing bridge on
    // a delayed emission would otherwise escape as an uncaught timer error — isolate it here too.
    onEmit: (event) => observeSafely(relay, () => relay.emit(event)),
    onError: (error) => observeSafely(relay, () => relay.fail(error)),
    now,
  })

  function indicateLogs(): void {
    relay.indicate({
      id: "logs",
      label: `${label} · logs`,
      value: `${counts.logs} log${counts.logs === 1 ? "" : "s"}${counts.logErrors > 0 ? ` · ${counts.logErrors} error` : ""}`,
      severity: counts.logErrors > 0 ? "error" : "ok",
      updatedAt: now(),
      target: "observability",
    })
  }

  function rememberDetail(record: Json): string | undefined {
    // Retention is gated on an active registration: a log arriving before the source connects or
    // after it is disposed is dropped by the relay, so retaining its allowlisted fields would keep
    // captured detail alive with no session able to request it.
    if (allow === undefined || !relay.active) return undefined
    detailCounter += 1
    const ref = `log-${detailCounter}`
    details.set(ref, record)
    if (details.size > detailCapacity) {
      const oldest = details.keys().next().value
      if (oldest !== undefined) details.delete(oldest)
    }
    return ref
  }

  const logSink = (record: LogRecord): void => {
    if (!relay.active) return
    observeSafely(relay, () => {
      counts.logs += 1
      if (record.level === "error") counts.logErrors += 1
      const detail = rememberDetail({
        level: record.level,
        message: record.message,
        time: record.time,
        fields: pickFields(record.fields, allow),
      })
      logSampler.offer({
        kind: "log",
        label: `[${record.level}] ${record.message}`,
        severity: logSeverity(record.level),
        at: record.time,
        summary: { level: record.level },
        ...(detail !== undefined ? { detail } : {}),
      })
      indicateLogs()
      relay.recover()
    })
  }

  const reporterBackend: ReporterBackend = {
    name: `devtools:${options.instance}`,
    enqueue: (event: ReportEvent): void => {
      observeSafely(relay, () => {
        counts.reports += 1
        relay.emit({
          kind: "report",
          label: `${event.severity}: ${event.error.name}: ${event.message}`,
          severity: reportSeverity(event.severity),
          at: event.time,
          summary: { severity: event.severity, name: event.error.name, message: event.message },
        })
        relay.indicate({
          id: "reports",
          label: `${label} · reports`,
          value: `${counts.reports} reported`,
          severity: counts.reports > 0 ? "warn" : "ok",
          updatedAt: now(),
          target: "observability",
        })
        relay.recover()
      })
    },
  }

  const vitalReporter: WebVitalReporter = (metric: WebVitalMetric): void => {
    observeSafely(relay, () => {
      relay.emit({
        kind: "vital",
        label: `${metric.name} ${formatVital(metric)} (${metric.rating})`,
        severity: vitalSeverity(metric.rating),
        at: now(),
        summary: { name: metric.name, value: metric.value, rating: metric.rating },
      })
      relay.indicate({
        id: `vital:${metric.name}`,
        label: metric.name,
        value: `${formatVital(metric)} · ${metric.rating}`,
        severity: vitalSeverity(metric.rating),
        updatedAt: now(),
        target: "observability",
      })
      relay.recover()
    })
  }

  const source: Source = {
    id: { kind: "observability", instance: options.instance },
    label,
    connect(observer) {
      const unbind = relay.bind(observer)
      observeSafely(relay, indicateLogs)
      const handle: SourceHandle = {
        resolveDetail(ref) {
          const record = details.get(ref)
          if (record === undefined) throw new Error(`No retained log for ${ref}.`)
          return Promise.resolve(record)
        },
        dispose() {
          if (!unbind()) return
          logSampler.dispose()
          details.clear()
        },
      }
      return handle
    },
  }

  return { source, logSink, reporterBackend, vitalReporter }
}

function pickFields(
  fields: LogRecord["fields"],
  allow: readonly string[] | undefined,
): { readonly [key: string]: Json } {
  if (allow === undefined) return {}
  const picked: Record<string, Json> = {}
  for (const name of allow) {
    let descriptor: PropertyDescriptor | undefined
    try {
      descriptor = Object.getOwnPropertyDescriptor(fields, name)
    } catch {
      picked[name] = "[non-scalar]"
      continue
    }
    if (descriptor === undefined) continue
    if (!("value" in descriptor)) {
      picked[name] = "[non-scalar]"
      continue
    }
    if (descriptor.value !== undefined) picked[name] = toJson(descriptor.value)
  }
  return picked
}

/** Preserve safe scalar fields without invoking caller-controlled coercion. */
function toJson(value: unknown): Json {
  if (value === null) return null
  const type = typeof value
  if (type === "boolean" || type === "string") return value as Json
  if (type === "number") return Number.isFinite(value as number) ? (value as number) : null
  return "[non-scalar]"
}

function logSeverity(level: LogRecord["level"]): Severity {
  if (level === "error") return "error"
  if (level === "warn") return "warn"
  return "info"
}

function reportSeverity(severity: ReportEvent["severity"]): Severity {
  return severity === "warning" ? "warn" : "error"
}

function vitalSeverity(rating: WebVitalMetric["rating"]): Severity {
  if (rating === "poor") return "error"
  if (rating === "needs-improvement") return "warn"
  return "ok"
}

/** `CLS` is unitless; every other Web Vital is milliseconds. */
function formatVital(metric: WebVitalMetric): string {
  return metric.name === "CLS" ? `${metric.value}` : `${metric.value}ms`
}
