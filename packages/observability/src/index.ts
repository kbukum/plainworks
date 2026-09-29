// Prelude for `@plainworks/observability`: `createTelemetry`, the `std/seam` Telemetry a host wires
// into every transport. Each other concern is its own subpath: `./logging`, `./reporting`,
// `./vitals`, and the browser collector under `./client`. Re-export-only barrel.
export type { TelemetryOptions } from "./telemetry"
export { createTelemetry } from "./telemetry"
