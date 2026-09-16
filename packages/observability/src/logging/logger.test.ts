import { manualClock } from "@plainworks/testkit"
import { describe, expect, test } from "vitest"
import { createLogger, type LogRecord } from "./logger"

function collector(): { records: LogRecord[]; sink: (record: LogRecord) => void } {
  const records: LogRecord[] = []
  return { records, sink: (record) => records.push(record) }
}

describe("createLogger", () => {
  test("redacts sensitive fields before they reach the sink", () => {
    const { records, sink } = collector()
    const log = createLogger({ sink, clock: manualClock(1000) })

    log.info("login", { userId: "u1", authorization: "Bearer secret-token", password: "hunter2" })

    expect(records).toHaveLength(1)
    const [record] = records
    expect(record?.fields).toEqual({
      userId: "u1",
      authorization: "[REDACTED]",
      password: "[REDACTED]",
    })
  })

  test("redacts a token-shaped message so a credential never reaches the sink", () => {
    const { records, sink } = collector()
    const log = createLogger({ sink })

    log.warn("Authorization: Bearer live-token-value")

    expect(records[0]?.message).toBe("Authorization: [REDACTED]")
  })

  test("stamps each record with the injected clock and level", () => {
    const { records, sink } = collector()
    const clock = manualClock(500)
    const log = createLogger({ sink, clock })

    log.debug("first")
    clock.advance(250)
    log.error("second")

    expect(records.map((r) => [r.level, r.time, r.message])).toEqual([
      ["debug", 500, "first"],
      ["error", 750, "second"],
    ])
  })

  test("drops records below minLevel", () => {
    const { records, sink } = collector()
    const log = createLogger({ sink, minLevel: "warn" })

    log.debug("d")
    log.info("i")
    log.warn("w")
    log.error("e")

    expect(records.map((r) => r.level)).toEqual(["warn", "error"])
  })

  test("child merges base fields under per-call fields and redacts them too", () => {
    const { records, sink } = collector()
    const root = createLogger({ sink, base: { service: "api" } })
    const child = root.child({ requestId: "r1", token: "abc.def.ghi" })

    child.info("handled", { requestId: "r2" })

    expect(records[0]?.fields).toEqual({
      service: "api",
      requestId: "r2",
      token: "[REDACTED]",
    })
  })

  test("honors extra redactKeys", () => {
    const { records, sink } = collector()
    const log = createLogger({ sink, redactKeys: ["ssn"] })

    log.info("pii", { ssn: "123-45-6789", name: "Ada" })

    expect(records[0]?.fields).toEqual({ ssn: "[REDACTED]", name: "Ada" })
  })

  test("propagates sink failures to the caller", () => {
    const failure = new Error("sink unavailable")
    const log = createLogger({
      sink: () => {
        throw failure
      },
    })

    expect(() => log.error("boom")).toThrow(failure)
  })
})
