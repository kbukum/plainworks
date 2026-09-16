/** The Core Web Vitals and supporting metrics this package rates. */
export type WebVitalName = "CLS" | "FCP" | "INP" | "LCP" | "TTFB"

/** A metric's quality bucket per the web.dev thresholds. */
export type WebVitalRating = "good" | "needs-improvement" | "poor"

/** One collected Web Vital measurement, already rated — the shape a {@link WebVitalReporter} receives. */
export interface WebVitalMetric {
  readonly name: WebVitalName
  /** Metric value in its native unit — milliseconds, except unitless `CLS`. */
  readonly value: number
  readonly rating: WebVitalRating
}

/**
 * The reporting seam a collector calls for each measurement. DOM-free by design, so a consumer can
 * forward it to a {@link import("../logging").Logger} or
 * {@link import("../reporting").ErrorReporter} from neutral code.
 */
export type WebVitalReporter = (metric: WebVitalMetric) => void

/**
 * The `good`/`poor` boundaries from web.dev: at or below `good` rates `"good"`, above `poor` rates
 * `"poor"`, and the band between is `"needs-improvement"`. `CLS` is unitless; the rest are
 * milliseconds.
 */
const THRESHOLDS: Record<WebVitalName, { readonly good: number; readonly poor: number }> = {
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  INP: { good: 200, poor: 500 },
  LCP: { good: 2500, poor: 4000 },
  TTFB: { good: 800, poor: 1800 },
}

/**
 * Rate a raw Web Vital value against its web.dev thresholds. Pure and DOM-free — the collector
 * layers over this so the rating logic is tested without a browser.
 */
export function rateWebVital(name: WebVitalName, value: number): WebVitalRating {
  const { good, poor } = THRESHOLDS[name]
  if (value <= good) {
    return "good"
  }
  if (value > poor) {
    return "poor"
  }
  return "needs-improvement"
}
