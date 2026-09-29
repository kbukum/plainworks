import { expect, test } from "vitest"
import { recordTelemetry } from "./telemetry"

test("records an operation's start and its merged settle attributes", () => {
  const telemetry = recordTelemetry()
  const operation = telemetry.start("http.client.request", { "http.request.method": "GET" })
  operation.finish({ "http.response.status_code": 200 })

  expect(telemetry.records).toEqual([
    { kind: "start", name: "http.client.request", attributes: { "http.request.method": "GET" } },
    {
      kind: "finish",
      name: "http.client.request",
      attributes: { "http.request.method": "GET", "http.response.status_code": 200 },
    },
  ])
})

test("an operation settles once", () => {
  const telemetry = recordTelemetry()
  const operation = telemetry.start("op")
  operation.fail({ type: "timeout", message: "late" })
  operation.finish()
  operation.fail({ type: "other", message: "again" })

  expect(telemetry.records.map((record) => record.kind)).toEqual(["start", "fail"])
})

test("records events and clears", () => {
  const telemetry = recordTelemetry()
  telemetry.event("channel.event.dropped", { "channel.overflow.policy": "drop-new" })
  expect(telemetry.records).toEqual([
    {
      kind: "event",
      name: "channel.event.dropped",
      attributes: { "channel.overflow.policy": "drop-new" },
    },
  ])
  telemetry.clear()
  expect(telemetry.records).toEqual([])
})
