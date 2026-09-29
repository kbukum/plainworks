// Re-export-only barrel for the telemetry concern: the `std/seam` Telemetry implemented over a
// logger. No logic here.
export type { TelemetryOptions } from "./telemetry"
export { createTelemetry } from "./telemetry"
