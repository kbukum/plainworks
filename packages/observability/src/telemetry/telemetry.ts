import type { Telemetry, TelemetryAttributes } from "@plainworks/std/seam"
import { type Clock, systemClock } from "@plainworks/std/time"
import type { Logger } from "../logging"

/** Options for {@link createTelemetry}. */
export interface TelemetryOptions {
  /** Where operations and events are written. Redaction happens in the logger. */
  readonly logger: Logger
  /** Time source for `duration_ms`; defaults to the host wall clock. */
  readonly clock?: Clock
}

/**
 * Build a {@link Telemetry} that writes to a {@link Logger}. Each record's message is the operation
 * or event name, and its fields are the attributes plus `telemetry.phase`:
 *
 * - `start` logs at `debug`.
 * - `finish` logs at `info` with `duration_ms`.
 * - `fail` logs at `error` with `duration_ms`, `error.type` and `exception.message`.
 * - `event` logs at `info`.
 *
 * An operation settles once; a second `finish` or `fail` writes nothing.
 */
export function createTelemetry(options: TelemetryOptions): Telemetry {
  const { logger } = options
  const clock = options.clock ?? systemClock

  return {
    start(name, attributes = {}) {
      const startedAt = clock.now()
      let settled = false
      logger.debug(name, { ...attributes, "telemetry.phase": "start" })
      const settle = (): number | undefined => {
        if (settled) {
          return undefined
        }
        settled = true
        return clock.now() - startedAt
      }
      return {
        finish(extra?: TelemetryAttributes) {
          const duration = settle()
          if (duration !== undefined) {
            logger.info(name, {
              ...attributes,
              ...extra,
              "telemetry.phase": "finish",
              duration_ms: duration,
            })
          }
        },
        fail(failure, extra?: TelemetryAttributes) {
          const duration = settle()
          if (duration !== undefined) {
            logger.error(name, {
              ...attributes,
              ...extra,
              "telemetry.phase": "fail",
              duration_ms: duration,
              "error.type": failure.type,
              "exception.message": failure.message,
            })
          }
        },
      }
    },
    event(name, attributes = {}) {
      logger.info(name, { ...attributes, "telemetry.phase": "event" })
    },
  }
}
