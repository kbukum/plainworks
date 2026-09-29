import { describe, expect, test } from "vitest"
import { PlainError } from "../error"
import { noopTelemetry, toTelemetryFailure } from "./telemetry"

describe("noopTelemetry", () => {
  test("accepts every call and records nothing", () => {
    const operation = noopTelemetry.start("http.client.request", { "http.request.method": "GET" })
    expect(() => operation.finish({ "http.response.status_code": 200 })).not.toThrow()
    expect(() => operation.fail({ type: "timeout", message: "late" })).not.toThrow()
    expect(() => noopTelemetry.event("channel.event.dropped")).not.toThrow()
  })
})

describe("toTelemetryFailure", () => {
  test("uses a typed error's kind as the low-cardinality type", () => {
    const failure = toTelemetryFailure(new PlainError("http/timeout", "request timed out"))
    expect(failure).toEqual({ type: "http/timeout", message: "request timed out" })
  })

  test("falls back to the error name, then to _OTHER", () => {
    expect(toTelemetryFailure(new TypeError("bad")).type).toBe("TypeError")
    expect(toTelemetryFailure("boom")).toEqual({ type: "_OTHER", message: "boom" })
  })

  test("redacts a credential in the message", () => {
    const failure = toTelemetryFailure(
      new Error("failed with Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl"),
    )
    expect(failure.message).not.toContain("eyJhbGciOiJIUzI1NiJ9")
  })

  test("never invokes an accessor on the thrown value", () => {
    const hostile = new Error("hostile")
    Object.defineProperty(hostile, "kind", {
      enumerable: true,
      get() {
        throw new Error("accessor ran")
      },
    })
    expect(toTelemetryFailure(hostile)).toEqual({ type: "Error", message: "hostile" })
  })
})
