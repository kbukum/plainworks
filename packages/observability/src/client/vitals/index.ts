// Re-export-only barrel for the browser Web Vitals collector concern.
export type {
  ObserveWebVitalsOptions,
  PerformanceObserverFactory,
  PerformanceObserverLike,
  WebVitalObserverEntry,
} from "./collect"
export { observeWebVitals } from "./collect"
