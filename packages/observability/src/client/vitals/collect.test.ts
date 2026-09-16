// @vitest-environment jsdom
// Client tests opt into jsdom per file; the package default stays `node` so the neutral `.` entry
// can never lean on DOM globals unnoticed.
import { afterEach, describe, expect, test, vi } from "vitest"
import type { WebVitalMetric } from "../../vitals/metric"
import {
  observeWebVitals,
  type PerformanceObserverFactory,
  type WebVitalObserverEntry,
} from "./collect"

interface FakeObserver {
  readonly factory: PerformanceObserverFactory
  emit(entries: readonly WebVitalObserverEntry[]): void
  queue(entries: readonly WebVitalObserverEntry[]): void
  readonly observed: string[]
  readonly observeOptions: Array<{ type: string; buffered?: boolean; durationThreshold?: number }>
  isDisconnected(): boolean
}

function fakeObserver(unsupported: readonly string[] = []): FakeObserver {
  let callback: (entries: readonly WebVitalObserverEntry[]) => void = () => {}
  const observed: string[] = []
  const observeOptions: Array<{
    type: string
    buffered?: boolean
    durationThreshold?: number
  }> = []
  let queued: readonly WebVitalObserverEntry[] = []
  let disconnected = false
  return {
    observed,
    observeOptions,
    factory: (cb) => {
      callback = cb
      return {
        observe: (options) => {
          const { type } = options
          if (unsupported.includes(type)) {
            throw new Error(`unsupported: ${type}`)
          }
          observed.push(type)
          observeOptions.push(options)
        },
        takeRecords: () => {
          const entries = queued
          queued = []
          return entries
        },
        disconnect: () => {
          disconnected = true
        },
      }
    },
    emit: (entries) => callback(entries),
    queue: (entries) => {
      queued = entries
    },
    isDisconnected: () => disconnected,
  }
}

describe("observeWebVitals", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test("reports FCP and TTFB eagerly as their entries arrive", () => {
    const report: WebVitalMetric[] = []
    const obs = fakeObserver()
    observeWebVitals((metric) => report.push(metric), {
      observerFactory: obs.factory,
      subscribeFlush: () => () => {},
    })

    obs.emit([{ entryType: "paint", name: "first-contentful-paint", startTime: 1000 }])
    obs.emit([{ entryType: "navigation", name: "", startTime: 0, responseStart: 600 }])

    expect(report).toEqual([
      { name: "FCP", value: 1000, rating: "good" },
      { name: "TTFB", value: 600, rating: "good" },
    ])
  })

  test("finalizes LCP, CLS, and INP once on flush using their aggregation rules", () => {
    const report: WebVitalMetric[] = []
    const obs = fakeObserver()
    let flush = (): void => {}
    observeWebVitals((metric) => report.push(metric), {
      observerFactory: obs.factory,
      subscribeFlush: (f) => {
        flush = f
        return () => {}
      },
    })

    obs.emit([{ entryType: "largest-contentful-paint", name: "", startTime: 2000 }])
    obs.emit([{ entryType: "largest-contentful-paint", name: "", startTime: 2400 }])
    obs.emit([{ entryType: "layout-shift", name: "", startTime: 100, value: 0.05 }])
    obs.emit([{ entryType: "layout-shift", name: "", startTime: 900, value: 0.04 }])
    obs.emit([{ entryType: "layout-shift", name: "", startTime: 2100, value: 0.08 }])
    // A shift following recent user input does not count toward CLS.
    obs.emit([
      { entryType: "layout-shift", name: "", startTime: 0, value: 0.5, hadRecentInput: true },
    ])
    obs.emit([
      { entryType: "event", name: "pointerdown", startTime: 0, duration: 120, interactionId: 7 },
      { entryType: "event", name: "click", startTime: 0, duration: 250, interactionId: 7 },
    ])
    obs.emit([
      { entryType: "event", name: "keydown", startTime: 0, duration: 180, interactionId: 14 },
    ])

    flush()
    flush()

    expect(report).toEqual([
      { name: "LCP", value: 2400, rating: "good" },
      { name: "CLS", value: 0.09, rating: "good" },
      { name: "INP", value: 250, rating: "needs-improvement" },
    ])
    expect(obs.observeOptions).toContainEqual({
      type: "event",
      buffered: true,
      durationThreshold: 0,
    })
  })

  test("INP selects the estimated p98 interaction rather than the single largest event", () => {
    const report: WebVitalMetric[] = []
    const obs = fakeObserver()
    let flush = (): void => {}
    observeWebVitals((metric) => report.push(metric), {
      observerFactory: obs.factory,
      subscribeFlush: (callback) => {
        flush = callback
        return () => {}
      },
    })
    obs.emit(
      Array.from({ length: 50 }, (_, index) => ({
        entryType: "event",
        name: "click",
        startTime: index,
        duration: 500 - index,
        interactionId: (index + 1) * 7,
      })),
    )

    flush()

    expect(report).toContainEqual({ name: "INP", value: 499, rating: "needs-improvement" })
  })

  test("teardown drains queued records, flushes once, and disconnects the observer", () => {
    const report: WebVitalMetric[] = []
    const obs = fakeObserver()
    const teardown = observeWebVitals((metric) => report.push(metric), {
      observerFactory: obs.factory,
      subscribeFlush: () => () => {},
    })
    obs.queue([{ entryType: "largest-contentful-paint", name: "", startTime: 1800 }])

    teardown()

    expect(report).toEqual([
      { name: "LCP", value: 1800, rating: "good" },
      { name: "CLS", value: 0, rating: "good" },
    ])
    expect(obs.isDisconnected()).toBe(true)
  })

  test("teardown disconnects and unsubscribes when reporting throws", () => {
    const obs = fakeObserver()
    let unsubscribed = false
    const teardown = observeWebVitals(
      () => {
        throw new Error("report failed")
      },
      {
        observerFactory: obs.factory,
        subscribeFlush: () => () => {
          unsubscribed = true
        },
      },
    )

    expect(() => teardown()).toThrow("report failed")
    expect(unsubscribed).toBe(true)
    expect(obs.isDisconnected()).toBe(true)
  })

  test("skips an entry type the runtime rejects and keeps observing the rest", () => {
    const report: WebVitalMetric[] = []
    const obs = fakeObserver(["event"])

    expect(() =>
      observeWebVitals((metric) => report.push(metric), {
        observerFactory: obs.factory,
        subscribeFlush: () => () => {},
      }),
    ).not.toThrow()
    expect(obs.observed).not.toContain("event")
    expect(obs.observed).toContain("largest-contentful-paint")
  })

  test("omits CLS when the runtime rejects layout-shift instead of reporting a false zero", () => {
    const report: WebVitalMetric[] = []
    const obs = fakeObserver(["layout-shift"])
    let flush = (): void => {}
    observeWebVitals((metric) => report.push(metric), {
      observerFactory: obs.factory,
      subscribeFlush: (f) => {
        flush = f
        return () => {}
      },
    })

    obs.emit([{ entryType: "largest-contentful-paint", name: "", startTime: 2000 }])
    flush()

    expect(obs.observed).not.toContain("layout-shift")
    expect(report).toEqual([{ name: "LCP", value: 2000, rating: "good" }])
    expect(report).not.toContainEqual(expect.objectContaining({ name: "CLS" }))
  })

  test("default flush trigger fires when the document becomes hidden", () => {
    const report: WebVitalMetric[] = []
    const obs = fakeObserver()
    observeWebVitals((metric) => report.push(metric), { observerFactory: obs.factory })

    obs.emit([{ entryType: "largest-contentful-paint", name: "", startTime: 2000 }])
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true })
    document.dispatchEvent(new Event("visibilitychange"))

    expect(report).toContainEqual({ name: "LCP", value: 2000, rating: "good" })
  })

  test("builds a real observer from the host PerformanceObserver by default", () => {
    const observe = vi.fn()
    const disconnect = vi.fn()
    const takeRecords = vi.fn(() => [])
    const observerConstructor = vi.fn(function (this: PerformanceObserver) {
      Object.assign(this, { observe, disconnect, takeRecords })
    })
    vi.stubGlobal("PerformanceObserver", observerConstructor)

    const teardown = observeWebVitals(() => {}, {
      subscribeFlush: () => () => {},
    })

    expect(observerConstructor).toHaveBeenCalledOnce()
    expect(observe).toHaveBeenCalledTimes(5)
    expect(observe).toHaveBeenCalledWith({
      type: "event",
      buffered: true,
      durationThreshold: 0,
    })
    teardown()
    expect(takeRecords).toHaveBeenCalledOnce()
    expect(disconnect).toHaveBeenCalledOnce()
  })

  test("is an inert no-op on a runtime without PerformanceObserver", () => {
    // Simulate a runtime (SSR) where the host global is absent, so the default factory yields none.
    vi.stubGlobal("PerformanceObserver", undefined)
    const report: WebVitalMetric[] = []
    const teardown = observeWebVitals((metric) => report.push(metric))

    expect(typeof teardown).toBe("function")
    teardown()
    expect(report).toEqual([])
  })
})
