import type {
  Telemetry,
  TelemetryAttributes,
  TelemetryFailure,
  TelemetryOperation,
} from "@plainworks/std/seam"

/**
 * One call a {@link RecordedTelemetry} saw. A `finish` or `fail` carries the start attributes
 * merged with the ones given when it settled, the way a real sink would report them.
 */
export type TelemetryRecord =
  | { readonly kind: "start"; readonly name: string; readonly attributes: TelemetryAttributes }
  | { readonly kind: "finish"; readonly name: string; readonly attributes: TelemetryAttributes }
  | {
      readonly kind: "fail"
      readonly name: string
      readonly failure: TelemetryFailure
      readonly attributes: TelemetryAttributes
    }
  | { readonly kind: "event"; readonly name: string; readonly attributes: TelemetryAttributes }

/** A {@link Telemetry} that keeps every call in order, so a test can assert what was reported. */
export interface RecordedTelemetry extends Telemetry {
  /** Every call so far, in order. */
  readonly records: readonly TelemetryRecord[]
  /** Drop the recorded calls. */
  clear(): void
}

/**
 * Build a {@link RecordedTelemetry}. It follows the seam contract: an operation settles once, so a
 * second `finish` or `fail` is not recorded.
 */
export function recordTelemetry(): RecordedTelemetry {
  const records: TelemetryRecord[] = []
  return {
    records,
    start(name, attributes = {}): TelemetryOperation {
      records.push({ kind: "start", name, attributes })
      let settled = false
      return {
        finish(extra = {}) {
          if (settled) {
            return
          }
          settled = true
          records.push({ kind: "finish", name, attributes: { ...attributes, ...extra } })
        },
        fail(failure, extra = {}) {
          if (settled) {
            return
          }
          settled = true
          records.push({ kind: "fail", name, failure, attributes: { ...attributes, ...extra } })
        },
      }
    },
    event(name, attributes = {}) {
      records.push({ kind: "event", name, attributes })
    },
    clear() {
      records.length = 0
    },
  }
}
