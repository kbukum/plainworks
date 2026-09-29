// Re-export-only barrel for the privacy concern: redacting sensitive fields before data leaves a
// trust boundary (logs, telemetry, diagnostics).
export type { RedactOptions } from "./redact"
export { isSensitiveKey, redact } from "./redact"
