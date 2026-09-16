"use client"

// Client public entry for `@plainworks/observability` — re-export-only barrel over the browser Web
// Vitals collector. The per-module `"use client"` directive makes tsdown emit this (and only the
// client graph) as the client entry; the server `.` entry stays DOM-free. The neutral metric shapes
// and reporter seam ship from the `.` entry — the collector reuses them directly.
export type {
  ObserveWebVitalsOptions,
  PerformanceObserverFactory,
  PerformanceObserverLike,
  WebVitalObserverEntry,
} from "./client/vitals"
export { observeWebVitals } from "./client/vitals"
