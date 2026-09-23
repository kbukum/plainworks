import type { LogRecord, ReportEvent, WebVitalMetric } from "@plainworks/observability"
import { describe, expect, it, vi } from "vitest"
import { createDevtoolsSession } from "../../session"
import type { SourceObserver } from "../../source"
import { createObservabilitySource, type ObservabilitySourceOptions } from "./observability-source"

function logRecord(partial: Partial<LogRecord> = {}): LogRecord {
  return { level: "info", message: "hello", time: 1, fields: {}, ...partial }
}

function reportEvent(partial: Partial<ReportEvent> = {}): ReportEvent {
  return {
    severity: "error",
    message: "boom",
    error: { name: "TypeError", message: "boom" },
    fields: {},
    tags: {},
    time: 2,
    ...partial,
  }
}

function vital(partial: Partial<WebVitalMetric> = {}): WebVitalMetric {
  return { name: "LCP", value: 2400, rating: "good", ...partial }
}

function setup(options: ObservabilitySourceOptions) {
  const session = createDevtoolsSession()
  const instrumentation = createObservabilitySource(options)
  session.registerSource(instrumentation.source)
  const port = session.connect()
  return { port, instrumentation }
}

function eventsOf(port: ReturnType<ReturnType<typeof createDevtoolsSession>["connect"]>) {
  return port.snapshot().events.map((entry) => entry.event)
}

function indicator(
  port: ReturnType<ReturnType<typeof createDevtoolsSession>["connect"]>,
  id: string,
) {
  return port.snapshot().indicators.find((entry) => entry.indicator.id === id)?.indicator
}

describe("createObservabilitySource", () => {
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])(
    "rejects an invalid log interval of %s",
    (logIntervalMs) => {
      expect(() => createObservabilitySource({ instance: "web", logIntervalMs })).toThrowError(
        RangeError,
      )
    },
  )

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY])(
    "rejects an invalid detail capacity of %s",
    (detailCapacity) => {
      expect(() => createObservabilitySource({ instance: "web", detailCapacity })).toThrowError(
        RangeError,
      )
    },
  )

  it("requires an explicit instance identity so two wirings stay distinct", () => {
    const session = createDevtoolsSession()
    session.registerSource(createObservabilitySource({ instance: "web" }).source)
    session.registerSource(createObservabilitySource({ instance: "worker" }).source)
    expect(
      session
        .connect()
        .snapshot()
        .sources.map((source) => source.id),
    ).toEqual([
      { kind: "observability", instance: "web" },
      { kind: "observability", instance: "worker" },
    ])
  })

  it("tees logs into the timeline and tracks running counts on the indicator", () => {
    const { port, instrumentation } = setup({ instance: "web", logIntervalMs: 0 })
    instrumentation.logSink(logRecord({ message: "started" }))
    instrumentation.logSink(logRecord({ level: "error", message: "crashed" }))

    const logs = eventsOf(port).filter((event) => event.kind === "log")
    expect(logs.map((event) => event.label)).toEqual(["[info] started", "[error] crashed"])
    expect(logs.map((event) => event.severity)).toEqual(["info", "error"])
    expect(indicator(port, "logs")).toMatchObject({
      value: "2 logs · 1 error",
      severity: "error",
    })
  })

  it("surfaces only metadata by default, with no detail token", () => {
    const { port, instrumentation } = setup({ instance: "web", logIntervalMs: 0 })
    instrumentation.logSink(logRecord({ fields: { userId: "u1", route: "/home" } }))
    expect(eventsOf(port)[0]?.detail).toBeUndefined()
  })

  it("exposes only allowlisted log fields through on-demand detail", async () => {
    const { port, instrumentation } = setup({
      instance: "web",
      logIntervalMs: 0,
      captureLogFields: ["route"],
    })
    instrumentation.logSink(logRecord({ fields: { userId: "secret", route: "/home" } }))

    const event = eventsOf(port)[0]
    expect(event?.detail).toBeDefined()
    const result = await port.requestDetail(
      { kind: "observability", instance: "web" },
      event?.detail as string,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.value).toMatchObject({ fields: { route: "/home" } })
      expect(
        (result.value.value as { fields: Record<string, unknown> }).fields.userId,
      ).toBeUndefined()
    }
  })

  it("coalesces a burst of logs while keeping counts exact", () => {
    const { port, instrumentation } = setup({ instance: "web", logIntervalMs: 1000, now: () => 0 })
    instrumentation.logSink(logRecord({ message: "a" }))
    instrumentation.logSink(logRecord({ message: "b" }))
    instrumentation.logSink(logRecord({ message: "c" }))

    expect(eventsOf(port).filter((event) => event.kind === "log")).toHaveLength(1)
    expect(indicator(port, "logs")?.value).toBe("3 logs")
  })

  it("tees reports and never throws admission back into the reporter", () => {
    const { port, instrumentation } = setup({ instance: "web" })
    expect(instrumentation.reporterBackend.name).toBe("devtools:web")
    expect(() => instrumentation.reporterBackend.enqueue(reportEvent())).not.toThrow()

    const report = eventsOf(port).find((event) => event.kind === "report")
    expect(report).toMatchObject({ label: "error: TypeError: boom", severity: "error" })
    expect(indicator(port, "reports")).toMatchObject({ value: "1 reported", severity: "warn" })
  })

  it("bounds retained log detail, evicting the oldest beyond capacity", async () => {
    const { port, instrumentation } = setup({
      instance: "web",
      logIntervalMs: 0,
      captureLogFields: ["n"],
      detailCapacity: 1,
    })
    instrumentation.logSink(logRecord({ message: "first", fields: { n: 1 } }))
    instrumentation.logSink(logRecord({ message: "second", fields: { n: 2 } }))

    const [first, second] = eventsOf(port).filter((event) => event.kind === "log")
    const id = { kind: "observability", instance: "web" } as const
    const evicted = await port.requestDetail(id, first?.detail as string)
    const kept = await port.requestDetail(id, second?.detail as string)
    expect(evicted.ok).toBe(false)
    expect(kept.ok).toBe(true)
  })

  it("captures scalar fields without invoking getters or arbitrary coercion", async () => {
    let getterCalled = false
    const fields: Record<string, unknown> = {
      count: Number.NaN,
      meta: 7,
      object: { nested: true },
    }
    Object.defineProperty(fields, "computed", {
      enumerable: true,
      get() {
        getterCalled = true
        return "secret-payload"
      },
    })
    const { port, instrumentation } = setup({
      instance: "web",
      logIntervalMs: 0,
      captureLogFields: ["count", "meta", "object", "computed"],
    })
    instrumentation.logSink(logRecord({ fields }))
    const event = eventsOf(port)[0]
    const result = await port.requestDetail(
      { kind: "observability", instance: "web" },
      event?.detail as string,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      const captured = (result.value.value as { fields: Record<string, unknown> }).fields
      expect(captured).toMatchObject({
        count: null,
        meta: 7,
        object: "[non-scalar]",
        computed: "[non-scalar]",
      })
      expect(getterCalled).toBe(false)
    }
  })

  it("tees Web Vitals with a per-metric indicator and rating-based severity", () => {
    const { port, instrumentation } = setup({ instance: "web" })
    instrumentation.vitalReporter(vital({ name: "LCP", value: 5000, rating: "poor" }))
    instrumentation.vitalReporter(vital({ name: "CLS", value: 0.05, rating: "good" }))

    const events = eventsOf(port).filter((event) => event.kind === "vital")
    expect(events.map((event) => event.label)).toEqual(["LCP 5000ms (poor)", "CLS 0.05 (good)"])
    expect(indicator(port, "vital:LCP")).toMatchObject({
      value: "5000ms · poor",
      severity: "error",
    })
    expect(indicator(port, "vital:CLS")).toMatchObject({ value: "0.05 · good", severity: "ok" })
  })

  it("isolates a faulting tee from the operational path", () => {
    let failed = false
    const { instrumentation } = setup({
      instance: "web",
      logIntervalMs: 0,
      now: () => {
        // Force the tee's own bookkeeping to throw; a devtools fault must never escape the sink.
        if (failed) throw new Error("clock fault")
        return 0
      },
    })
    failed = true
    expect(() => instrumentation.logSink(logRecord())).not.toThrow()
    expect(() => instrumentation.reporterBackend.enqueue(reportEvent())).not.toThrow()
    expect(() => instrumentation.vitalReporter(vital())).not.toThrow()
  })

  it("drops tee output before connect and after disposal without buffering or throwing", () => {
    const session = createDevtoolsSession()
    const instrumentation = createObservabilitySource({ instance: "web", logIntervalMs: 0 })
    expect(() => instrumentation.logSink(logRecord())).not.toThrow()

    const registration = session.registerSource(instrumentation.source)
    const port = session.connect()
    registration.unsubscribe()
    expect(() => instrumentation.logSink(logRecord())).not.toThrow()
    expect(eventsOf(port).filter((event) => event.kind === "log")).toHaveLength(0)
  })

  it("never releases a pre-connect coalesced log after registration", () => {
    vi.useFakeTimers()
    try {
      const session = createDevtoolsSession()
      const instrumentation = createObservabilitySource({
        instance: "web",
        logIntervalMs: 1000,
        now: () => 0,
      })
      instrumentation.logSink(logRecord({ message: "before-a" }))
      instrumentation.logSink(logRecord({ message: "before-b" }))

      session.registerSource(instrumentation.source)
      const port = session.connect()
      vi.advanceTimersByTime(1000)
      expect(eventsOf(port).filter((event) => event.kind === "log")).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it("routes a trailing sampler clock failure through the source failure channel", () => {
    vi.useFakeTimers()
    try {
      let clockCalls = 0
      const failures: unknown[] = []
      const observer: SourceObserver = {
        emit: () => {},
        indicate: () => {},
        fail: (error) => failures.push(error),
        recover: () => {},
      }
      const instrumentation = createObservabilitySource({
        instance: "web",
        logIntervalMs: 1000,
        now: () => {
          clockCalls += 1
          if (clockCalls > 4) throw new Error("clock failed")
          return 0
        },
      })
      instrumentation.source.connect(observer, undefined as never)
      instrumentation.logSink(logRecord({ message: "a" }))
      instrumentation.logSink(logRecord({ message: "b" }))

      const beforeTrailing = failures.length
      expect(() => vi.advanceTimersByTime(1000)).not.toThrow()
      expect(failures).toHaveLength(beforeTrailing + 1)
    } finally {
      vi.useRealTimers()
    }
  })

  it("isolates a fault on the coalesced trailing log emission the owned timer releases", () => {
    vi.useFakeTimers()
    try {
      const failures: unknown[] = []
      const observer: SourceObserver = {
        emit: () => {
          throw new Error("bridge down")
        },
        indicate: () => {},
        fail: (error) => {
          failures.push(error)
        },
        recover: () => {},
      }
      const instrumentation = createObservabilitySource({ instance: "web", logIntervalMs: 1000 })
      instrumentation.source.connect(observer, undefined as never)

      // "a" emits on the leading edge; "b" is held for the timer's trailing edge, which fires
      // outside logSink's own observeSafely — the wrap keeps that fault from escaping uncaught.
      instrumentation.logSink(logRecord({ message: "a" }))
      instrumentation.logSink(logRecord({ message: "b" }))
      const beforeTrailing = failures.length
      expect(() => vi.advanceTimersByTime(1000)).not.toThrow()
      expect(failures.length).toBeGreaterThan(beforeTrailing)
    } finally {
      vi.useRealTimers()
    }
  })
})
