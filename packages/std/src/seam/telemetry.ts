import { createErrorSnapshot } from "../error"
import { type RedactOptions, redact } from "../privacy"

/** A value an attribute may carry — the primitive types OpenTelemetry accepts. */
export type TelemetryValue = string | number | boolean

/**
 * Redacted, low-cardinality facts about an operation or event. Name keys after the OpenTelemetry
 * semantic conventions (`http.request.method`, `url.full`, `http.response.status_code`) so an OTel
 * adapter is a plain mapping. Never put a payload, a token, or a user-supplied body in here.
 */
export type TelemetryAttributes = Readonly<Record<string, TelemetryValue>>

/**
 * Why an operation failed, already redacted. `type` is a low-cardinality code (OTel `error.type`),
 * such as an error `kind` or class name; `message` is the redacted message (OTel
 * `exception.message`). Build one with {@link toTelemetryFailure}.
 */
export interface TelemetryFailure {
  readonly type: string
  readonly message: string
}

/**
 * One running operation, returned by {@link Telemetry.start}. It settles once: the first `finish`
 * or `fail` wins and later calls do nothing, so an emitter can't report the same operation twice.
 */
export interface TelemetryOperation {
  /** The operation succeeded. `attributes` add to the ones given at start. */
  finish(attributes?: TelemetryAttributes): void
  /** The operation failed. `attributes` add to the ones given at start. */
  fail(failure: TelemetryFailure, attributes?: TelemetryAttributes): void
}

/**
 * The telemetry seam a transport or router reports through: operations with a start, a finish and
 * a failure, plus point events for things that are not operations (a dropped stream event). The
 * implementation owns time, sampling and output, so an emitter only describes what happened.
 * `@plainworks/observability` implements it over its logger and error reporter.
 */
export interface Telemetry {
  /** Begin an operation named for what it does (`http.client.request`). */
  start(name: string, attributes?: TelemetryAttributes): TelemetryOperation
  /** Record something that happened at one instant (`channel.event.dropped`). */
  event(name: string, attributes?: TelemetryAttributes): void
}

const noopOperation: TelemetryOperation = Object.freeze({
  finish: () => {},
  fail: () => {},
})

/** A {@link Telemetry} that records nothing — the default when a caller wires no telemetry. */
export const noopTelemetry: Telemetry = Object.freeze({
  start: () => noopOperation,
  event: () => {},
})

/** Read a string field from an inert snapshot, ignoring accessor markers. */
function snapshotString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" && value !== "[Getter]" ? value : undefined
}

/**
 * Reduce a thrown value to a redacted {@link TelemetryFailure}. The type is the error's `kind`
 * (a plainworks typed error), else its class name, else OTel's `_OTHER`. The message goes through
 * `redact`, so a token-shaped value is masked. Accessors on the thrown value are never invoked.
 */
export function toTelemetryFailure(error: unknown, options?: RedactOptions): TelemetryFailure {
  const snapshot = createErrorSnapshot(error)
  const isObject = error !== null && typeof error === "object"
  const type = isObject
    ? (snapshotString(snapshot.kind) ?? snapshotString(snapshot.name) ?? "_OTHER")
    : "_OTHER"
  const message = redact(snapshot.message, options)
  return { type, message: typeof message === "string" ? message : "[REDACTED]" }
}
