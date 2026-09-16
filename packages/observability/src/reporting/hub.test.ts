import { manualClock } from "@plainworks/testkit"
import { describe, expect, test } from "vitest"
import { createErrorReporter } from "./hub"
import type { ReportEvent, ReporterBackend } from "./reporter"

function recordingBackend(name = "test"): ReporterBackend & { events: ReportEvent[] } {
  const events: ReportEvent[] = []
  return { name, events, enqueue: (event) => void events.push(event) }
}

describe("createErrorReporter", () => {
  test("normalizes a thrown value to a sanitized error and stamps the event", () => {
    const backend = recordingBackend()
    const reporter = createErrorReporter({ backends: [backend], clock: manualClock(7) })

    reporter.report(new TypeError("bad input"), { severity: "fatal", tags: { route: "/x" } })

    expect(backend.events).toHaveLength(1)
    const [event] = backend.events
    expect(event?.error.name).toBe("TypeError")
    expect(event?.error.message).toBe("bad input")
    expect(event?.severity).toBe("fatal")
    expect(event?.tags).toEqual({ route: "/x" })
    expect(event?.time).toBe(7)
  })

  test("redacts the message and context fields before a backend sees them", () => {
    const backend = recordingBackend()
    const reporter = createErrorReporter({ backends: [backend] })
    const error = new Error("token=live-secret-value expired", {
      cause: new Error("api_key=cause-secret"),
    })
    error.stack = "Error: token=live-secret-value expired\n at secret=test-secret"

    reporter.report(error, {
      fields: { userId: "u1", api_key: "abcd1234" },
    })

    const [event] = backend.events
    expect(event?.message).toBe("token=[REDACTED] expired")
    expect(event?.error.message).toBe("token=[REDACTED] expired")
    expect(event?.error.stack).toBe("[Getter]")
    expect(event?.fields).toEqual({ userId: "u1", api_key: "[REDACTED]" })
  })

  test("does not invoke error accessors and redacts the error name and tags", () => {
    let invoked = false
    const error = new Error("boom")
    Object.defineProperties(error, {
      name: { get: () => "token=live-name-secret" },
      message: {
        get() {
          invoked = true
          throw new Error("accessed")
        },
      },
    })
    const tags = { authorization: "******", release: "api_key=release-secret" }
    const backend = recordingBackend()
    const reporter = createErrorReporter({ backends: [backend] })

    expect(() => reporter.report(error, { tags })).not.toThrow()

    expect(invoked).toBe(false)
    expect(backend.events[0]?.error.name).toBe("[Getter]")
    expect(backend.events[0]?.error.message).toBe("[Getter]")
    expect(backend.events[0]?.error.stack).not.toContain("live-name-secret")
    expect(backend.events[0]?.tags).toEqual({
      authorization: "[REDACTED]",
      release: "api_key=[REDACTED]",
    })
    expect(backend.events[0]?.tags).not.toBe(tags)
  })

  test("register adds a backend that receives subsequent reports", () => {
    const first = recordingBackend("first")
    const second = recordingBackend("second")
    const reporter = createErrorReporter({ backends: [first] })

    reporter.register(second)
    reporter.report(new Error("boom"))

    expect(first.events).toHaveLength(1)
    expect(second.events).toHaveLength(1)
  })

  test("rejects a duplicate backend name at registration and at construction", () => {
    const reporter = createErrorReporter({ backends: [recordingBackend("dupe")] })

    expect(() => reporter.register(recordingBackend("dupe"))).toThrow(/already registered/)
    expect(() =>
      createErrorReporter({ backends: [recordingBackend("x"), recordingBackend("x")] }),
    ).toThrow(/already registered/)
  })

  test("report returns a typed result describing delivered and failed backends", () => {
    const healthy = recordingBackend("healthy")
    const reporter = createErrorReporter({
      backends: [
        healthy,
        {
          name: "broken",
          enqueue: () => {
            throw new Error("backend down")
          },
        },
      ],
    })

    const result = reporter.report(new Error("boom"))

    expect(result.delivered).toBe(1)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]?.backend).toBe("broken")
  })

  test("report signals a normalization failure even without an onBackendError callback", () => {
    // A clock that throws makes event assembly fail after redaction; the caller must still learn.
    const reporter = createErrorReporter({
      backends: [recordingBackend()],
      clock: {
        now: () => {
          throw new Error("no clock")
        },
      },
    })

    const result = reporter.report(new Error("boom"))

    expect(result.delivered).toBe(0)
    expect(result.failures[0]?.backend).toBe("reporter")
  })

  test("a throwing backend is isolated: the failure surfaces and the others still run", () => {
    const failures: Array<{ backend: string; error: unknown }> = []
    const healthy = recordingBackend("healthy")
    const reporter = createErrorReporter({
      backends: [
        {
          name: "broken",
          enqueue: () => {
            throw new Error("backend down")
          },
        },
        healthy,
      ],
      onBackendError: (error, backend) => failures.push({ backend, error }),
    })

    expect(() => reporter.report(new Error("boom"))).not.toThrow()
    expect(healthy.events).toHaveLength(1)
    expect(failures).toHaveLength(1)
    expect(failures[0]?.backend).toBe("broken")
  })

  test("a throwing onBackendError callback never breaks the fan-out or the caller", () => {
    const healthy = recordingBackend("healthy")
    const reporter = createErrorReporter({
      backends: [
        {
          name: "broken",
          enqueue: () => {
            throw new Error("backend down")
          },
        },
        healthy,
      ],
      onBackendError: () => {
        throw new Error("diagnostics blew up")
      },
    })

    expect(() => reporter.report(new Error("boom"))).not.toThrow()
    // The throwing callback must not abort the loop — the healthy backend still runs.
    expect(healthy.events).toHaveLength(1)
  })

  test("registration during delivery affects only subsequent reports", () => {
    const late = recordingBackend("late")
    const reporter = createErrorReporter()
    let registered = false
    reporter.register({
      name: "registering",
      enqueue: () => {
        if (!registered) {
          registered = true
          reporter.register(late)
        }
      },
    })

    reporter.report(new Error("first"))
    expect(late.events).toHaveLength(0)

    reporter.report(new Error("second"))
    expect(late.events).toHaveLength(1)
  })
})
