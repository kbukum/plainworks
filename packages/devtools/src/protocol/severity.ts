/**
 * Severity shared by status indicators and timeline events. Ordered from healthy to failing so the
 * client can sort, filter, and color a mixed stream with one scale. It describes the observation,
 * not a log level.
 */
export type Severity = "ok" | "info" | "warn" | "error"

const SEVERITIES: readonly Severity[] = ["ok", "info", "warn", "error"]

/**
 * Whether `value` is a known {@link Severity}. Used when validating an inbound message so an
 * unknown scale never reaches the UI.
 */
export function isSeverity(value: unknown): value is Severity {
  return typeof value === "string" && (SEVERITIES as readonly string[]).includes(value)
}
