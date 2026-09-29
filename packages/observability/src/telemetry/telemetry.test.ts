import type { Telemetry, TelemetryAttributes } from "@plainworks/std/seam"
import { fixedClock } from "@plainworks/std/time"
import { manualClock, recordTelemetry } from "@plainworks/testkit"
import { describe, expect, test } from "vitest"
import { createLogger, type LogRecord } from "../logging"
import { createTelemetry } from "./telemetry"

type Seen =
  | {
      readonly kind: "start" | "finish" | "event"
      readonly name: string
      readonly attributes: TelemetryAttributes
    }
  | {
      readonly kind: "fail"
      readonly name: string
      readonly type: string
      readonly attributes: TelemetryAttributes
    }

interface Harness {
  readonly telemetry: Telemetry
  seen(): readonly Seen[]
}

function realHarness(): Harness {
  const records: LogRecord[] = []
  const telemetry = createTelemetry({
    logger: createLogger({ sink: (record) => records.push(record) }),
    clock: fixedClock(0),
  })
  return {
    telemetry,
    seen: () =>
      records.map((record): Seen => {
        const {
          "telemetry.phase": phase,
          "error.type": type,
          "exception.message": _,
          duration_ms: __,
          ...attributes
        } = record.fields as Record<string, string | number | boolean>
        if (phase === "fail") {
          return { kind: "fail", name: record.message, type: String(type), attributes }
        }
        return { kind: phase as "start" | "finish" | "event", name: record.message, attributes }
      }),
  }
}

function fakeHarness(): Harness {
  const telemetry = recordTelemetry()
  return {
    telemetry,
    seen: () =>
      telemetry.records.map(
        (record): Seen =>
          record.kind === "fail"
            ? {
                kind: "fail",
                name: record.name,
                type: record.failure.type,
                attributes: record.attributes,
              }
            : record,
      ),
  }
}

describe.each([
  ["recordTelemetry (fake)", fakeHarness],
  ["createTelemetry (observability)", realHarness],
])("Telemetry contract: %s", (_name, harness) => {
  test("an operation reports its start and its merged finish attributes", () => {
    const { telemetry, seen } = harness()
    telemetry.start("http.client.request", { "http.request.method": "GET" }).finish({
      "http.response.status_code": 200,
    })

    expect(seen()).toEqual([
      { kind: "start", name: "http.client.request", attributes: { "http.request.method": "GET" } },
      {
        kind: "finish",
        name: "http.client.request",
        attributes: { "http.request.method": "GET", "http.response.status_code": 200 },
      },
    ])
  })

  test("a failure reaches the output with its type, and the operation settles once", () => {
    const { telemetry, seen } = harness()
    const operation = telemetry.start("op")
    operation.fail({ type: "http/timeout", message: "late" }, { "server.address": "api.test" })
    operation.finish()
    operation.fail({ type: "other", message: "again" })

    expect(seen()).toEqual([
      { kind: "start", name: "op", attributes: {} },
      {
        kind: "fail",
        name: "op",
        type: "http/timeout",
        attributes: { "server.address": "api.test" },
      },
    ])
  })

  test("a point event is recorded with its attributes", () => {
    const { telemetry, seen } = harness()
    telemetry.event("channel.event.dropped", { "channel.overflow.policy": "drop-new" })

    expect(seen()).toEqual([
      {
        kind: "event",
        name: "channel.event.dropped",
        attributes: { "channel.overflow.policy": "drop-new" },
      },
    ])
  })
})

describe("createTelemetry", () => {
  test("logs at a level per phase and measures duration on the injected clock", () => {
    const records: LogRecord[] = []
    const clock = manualClock(1_000)
    const telemetry = createTelemetry({
      logger: createLogger({ sink: (record) => records.push(record), clock }),
      clock,
    })

    const ok = telemetry.start("ok")
    clock.advance(25)
    ok.finish()
    const bad = telemetry.start("bad")
    clock.advance(5)
    bad.fail({ type: "TypeError", message: "boom" })
    telemetry.event("tick")

    expect(records.map((record) => [record.level, record.message])).toEqual([
      ["debug", "ok"],
      ["info", "ok"],
      ["debug", "bad"],
      ["error", "bad"],
      ["info", "tick"],
    ])
    expect(records[1]?.fields.duration_ms).toBe(25)
    expect(records[3]?.fields).toMatchObject({
      duration_ms: 5,
      "error.type": "TypeError",
      "exception.message": "boom",
    })
  })
})
