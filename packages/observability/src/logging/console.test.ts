import { manualClock } from "@plainworks/testkit"
import { afterEach, describe, expect, test, vi } from "vitest"
import { type ConsoleLike, consoleSink, createConsoleLogger } from "./console"

function fakeConsole(): ConsoleLike & { calls: Array<{ level: string; arg: unknown }> } {
  const calls: Array<{ level: string; arg: unknown }> = []
  return {
    calls,
    debug: (arg) => calls.push({ level: "debug", arg }),
    info: (arg) => calls.push({ level: "info", arg }),
    warn: (arg) => calls.push({ level: "warn", arg }),
    error: (arg) => calls.push({ level: "error", arg }),
  }
}

describe("createConsoleLogger", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test("writes a redacted structured record to the matching console method", () => {
    const target = fakeConsole()
    const log = createConsoleLogger({ console: target, clock: manualClock(42) })

    log.error("boom", { requestId: "r1", secret: "s3cr3t" })

    expect(target.calls).toEqual([
      {
        level: "error",
        arg: { level: "error", message: "boom", time: 42, requestId: "r1", secret: "[REDACTED]" },
      },
    ])
  })

  test("building the logger touches no host console until the first record", () => {
    // No injected console and no host global read at construction — resolution is lazy.
    expect(() => createConsoleLogger({ clock: manualClock() })).not.toThrow()
  })

  test("falls back to the resolved host console when none is injected", () => {
    const hostConsole = (globalThis as { console?: ConsoleLike }).console
    if (hostConsole === undefined) {
      throw new Error("expected a host console under the node test environment")
    }
    const spy = vi.spyOn(hostConsole, "warn").mockImplementation(() => {})
    const log = createConsoleLogger({ clock: manualClock(5) })

    log.warn("host", { ok: true })

    expect(spy).toHaveBeenCalledWith({ level: "warn", message: "host", time: 5, ok: true })
  })

  test("throws a typed error on the first record when no host console exists", () => {
    vi.stubGlobal("console", undefined)
    const log = createConsoleLogger({ clock: manualClock() })

    expect(() => log.info("nowhere")).toThrow(TypeError)
  })

  test("consoleSink preserves logger-owned metadata over caller fields", () => {
    const target = fakeConsole()
    const sink = consoleSink(target)

    sink({
      level: "info",
      message: "hi",
      time: 1,
      fields: { a: 1, level: "error", message: "spoofed", time: 0 },
    })

    expect(target.calls[0]).toEqual({
      level: "info",
      arg: { level: "info", message: "hi", time: 1, a: 1 },
    })
  })
})
