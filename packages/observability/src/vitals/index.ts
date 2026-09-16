// Re-export-only barrel for the neutral (DOM-free) Web Vitals concern — metric shapes, the reporter
// seam, and the pure rating function. The browser collector lives under `src/client/vitals`.
export type { WebVitalMetric, WebVitalName, WebVitalRating, WebVitalReporter } from "./metric"
export { rateWebVital } from "./metric"
