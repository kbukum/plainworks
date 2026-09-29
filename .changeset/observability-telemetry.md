---
"@plainworks/observability": minor
---

Add `createTelemetry`, which reports the std `Telemetry` seam as structured log records with durations and OpenTelemetry-style attributes. Redesign the entry points so each concern has its own path: `.` holds telemetry, and logging, reporting, and Web Vitals live on `./logging`, `./reporting`, and `./vitals`.
