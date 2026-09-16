"use client"

import { rateWebVital, type WebVitalMetric, type WebVitalReporter } from "../../vitals/metric"

/**
 * The subset of a `PerformanceEntry` the collector reads. The extra fields live only on specific
 * entry subtypes (`layout-shift`, `event`, `navigation`), so they are optional — a plain
 * `PerformanceEntry` satisfies this shape, which keeps the browser default free of casts.
 */
export interface WebVitalObserverEntry {
  readonly entryType: string
  readonly name: string
  readonly startTime: number
  readonly duration?: number
  readonly value?: number
  readonly hadRecentInput?: boolean
  readonly interactionId?: number
  readonly responseStart?: number
}

/** The `PerformanceObserver` surface the collector uses. Injectable so tests drive it deterministically. */
export interface PerformanceObserverLike {
  observe(options: { type: string; buffered?: boolean; durationThreshold?: number }): void
  takeRecords(): readonly WebVitalObserverEntry[]
  disconnect(): void
}

/** Builds an observer that forwards batches of entries to `callback`. Defaults to the host `PerformanceObserver`. */
export type PerformanceObserverFactory = (
  callback: (entries: readonly WebVitalObserverEntry[]) => void,
) => PerformanceObserverLike

/** Options for {@link observeWebVitals}. */
export interface ObserveWebVitalsOptions {
  /** Inject the observer factory (tests, non-browser hosts); defaults to the host `PerformanceObserver`. */
  readonly observerFactory?: PerformanceObserverFactory
  /**
   * Subscribe a flush trigger for the metrics finalized late (`LCP`, `CLS`, `INP`). Defaults to the
   * document becoming hidden. Returns its own teardown.
   */
  readonly subscribeFlush?: (flush: () => void) => () => void
}

const ENTRY_TYPES = [
  "largest-contentful-paint",
  "paint",
  "layout-shift",
  "event",
  "navigation",
] as const

function defaultObserverFactory(): PerformanceObserverFactory | undefined {
  if (typeof PerformanceObserver === "undefined") {
    return undefined
  }
  return (callback) => {
    const observer = new PerformanceObserver((list) => {
      callback(list.getEntries())
    })
    return {
      observe: (options) => observer.observe(options),
      takeRecords: () => observer.takeRecords(),
      disconnect: () => observer.disconnect(),
    }
  }
}

function defaultSubscribeFlush(flush: () => void): () => void {
  if (typeof document === "undefined") {
    return () => {}
  }
  const handler = (): void => {
    if (document.visibilityState === "hidden") {
      flush()
    }
  }
  document.addEventListener("visibilitychange", handler)
  return () => document.removeEventListener("visibilitychange", handler)
}

/**
 * Collect Core Web Vitals from the browser Performance timeline and report each measurement through
 * the DOM-free {@link WebVitalReporter} seam. `FCP` and `TTFB` are reported as they arrive; `LCP`,
 * `CLS`, and `INP` are finalized on flush (the page becoming hidden, or teardown). CLS uses the
 * largest session window; INP groups events by interaction and selects the estimated 98th
 * percentile interaction. Returns a teardown that drains queued records, flushes once,
 * unsubscribes, and disconnects. Without `PerformanceObserver` it is an inert no-op.
 */
export function observeWebVitals(
  report: WebVitalReporter,
  options: ObserveWebVitalsOptions = {},
): () => void {
  const factory = options.observerFactory ?? defaultObserverFactory()
  if (factory === undefined) {
    return () => {}
  }
  const subscribeFlush = options.subscribeFlush ?? defaultSubscribeFlush

  let lcp: number | undefined
  let cls = 0
  let clsSessionValue = 0
  let clsSessionStart = 0
  let clsLastShift = 0
  const longestInteractions: Array<{ id: number; latency: number }> = []
  let minInteractionId = Number.POSITIVE_INFINITY
  let maxInteractionId = 0
  let flushed = false

  const emit = (name: WebVitalMetric["name"], value: number): void => {
    report({ name, value, rating: rateWebVital(name, value) })
  }

  const updateInteraction = (id: number, latency: number): void => {
    minInteractionId = Math.min(minInteractionId, id)
    maxInteractionId = Math.max(maxInteractionId, id)
    const existing = longestInteractions.find((interaction) => interaction.id === id)
    if (existing !== undefined) {
      existing.latency = Math.max(existing.latency, latency)
    } else {
      longestInteractions.push({ id, latency })
    }
    longestInteractions.sort((left, right) => right.latency - left.latency)
    longestInteractions.splice(10)
  }

  const processEntries = (entries: readonly WebVitalObserverEntry[]): void => {
    for (const entry of entries) {
      switch (entry.entryType) {
        case "largest-contentful-paint":
          lcp = entry.startTime
          break
        case "paint":
          if (entry.name === "first-contentful-paint") {
            emit("FCP", entry.startTime)
          }
          break
        case "layout-shift":
          if (entry.hadRecentInput !== true && entry.value !== undefined) {
            if (
              clsSessionValue > 0 &&
              entry.startTime - clsLastShift < 1000 &&
              entry.startTime - clsSessionStart < 5000
            ) {
              clsSessionValue += entry.value
            } else {
              clsSessionValue = entry.value
              clsSessionStart = entry.startTime
            }
            clsLastShift = entry.startTime
            cls = Math.max(cls, clsSessionValue)
          }
          break
        case "event":
          if (
            entry.interactionId !== undefined &&
            entry.interactionId > 0 &&
            entry.duration !== undefined
          ) {
            updateInteraction(entry.interactionId, entry.duration)
          }
          break
        case "navigation":
          if (entry.responseStart !== undefined) {
            emit("TTFB", entry.responseStart)
          }
          break
      }
    }
  }

  const observer = factory(processEntries)

  const observedTypes = new Set<string>()
  for (const type of ENTRY_TYPES) {
    try {
      observer.observe({
        type,
        buffered: true,
        ...(type === "event" ? { durationThreshold: 0 } : {}),
      })
      observedTypes.add(type)
    } catch {
      // A runtime that does not support an entry type throws on `observe`; skip it and keep the rest.
    }
  }

  const flush = (): void => {
    if (flushed) {
      return
    }
    flushed = true
    processEntries(observer.takeRecords())
    if (lcp !== undefined) {
      emit("LCP", lcp)
    }
    // Emit CLS only when `layout-shift` was actually observed; a hard `0` for an unsupported entry
    // type would masquerade as a perfect score.
    if (observedTypes.has("layout-shift")) {
      emit("CLS", cls)
    }
    if (longestInteractions.length > 0) {
      const interactionCount = (maxInteractionId - minInteractionId) / 7 + 1
      const index = Math.min(longestInteractions.length - 1, Math.floor(interactionCount / 50))
      const inp = longestInteractions[index]?.latency
      if (inp !== undefined) {
        emit("INP", inp)
      }
    }
  }

  let unsubscribeFlush: () => void
  try {
    unsubscribeFlush = subscribeFlush(flush)
  } catch (error) {
    observer.disconnect()
    throw error
  }
  return () => {
    try {
      flush()
    } finally {
      try {
        unsubscribeFlush()
      } finally {
        observer.disconnect()
      }
    }
  }
}
