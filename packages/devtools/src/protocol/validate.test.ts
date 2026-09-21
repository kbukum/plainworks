import { isErr, isOk } from "@plainworks/std"
import { describe, expect, it } from "vitest"
import { validateMessageEnvelope, validateRequestEnvelope } from "./validate"
import { PROTOCOL_VERSION } from "./version"

const id = { kind: "http", instance: "api" }

function envelope(message: unknown): unknown {
  return { protocol: PROTOCOL_VERSION, message }
}

describe("validateMessageEnvelope", () => {
  it("accepts a well-formed event message", () => {
    const result = validateMessageEnvelope(
      envelope({
        type: "event",
        id,
        seq: 3,
        event: { kind: "request", label: "GET /x", severity: "ok", at: 1 },
      }),
    )
    expect(isOk(result)).toBe(true)
  })

  it("tolerates unknown extra fields on a known message", () => {
    const result = validateMessageEnvelope(
      envelope({ type: "source-removed", id, future: "ignored" }),
    )
    expect(isOk(result)).toBe(true)
  })

  it("rejects an incompatible protocol version", () => {
    const result = validateMessageEnvelope({ protocol: 999, message: { type: "disposed" } })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.kind).toBe("devtools/protocol-incompatible")
  })

  it("rejects a non-record envelope", () => {
    expect(isErr(validateMessageEnvelope(null))).toBe(true)
    expect(isErr(validateMessageEnvelope("nope"))).toBe(true)
  })

  it("rejects an unknown message type", () => {
    const result = validateMessageEnvelope(envelope({ type: "mystery" }))
    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.kind).toBe("devtools/message-malformed")
  })

  it("rejects a message with a malformed source id", () => {
    const result = validateMessageEnvelope(envelope({ type: "source-removed", id: { kind: "" } }))
    expect(isErr(result)).toBe(true)
  })

  it("rejects an event with a non-numeric seq", () => {
    const result = validateMessageEnvelope(
      envelope({
        type: "event",
        id,
        seq: "x",
        event: { kind: "request", label: "l", severity: "ok", at: 1 },
      }),
    )
    expect(isErr(result)).toBe(true)
  })

  it.each([
    ["source descriptor", { type: "source-added", source: { id, label: "", commands: [] } }],
    [
      "command descriptor",
      {
        type: "source-added",
        source: {
          id,
          label: "API",
          commands: [{ id: "reset", label: "Reset", risk: "fatal", available: true }],
        },
      },
    ],
    ["source error", { type: "source-failed", id, error: { name: "Error" } }],
    [
      "event",
      {
        type: "event",
        id,
        seq: 1,
        event: { kind: "request", label: "GET /x", severity: "fatal", at: 1 },
      },
    ],
    [
      "indicator",
      {
        type: "indicator",
        id,
        indicator: {
          id: "cache",
          label: "Cache",
          value: "healthy",
          severity: "ok",
          updatedAt: Number.NaN,
        },
      },
    ],
    ["drop count", { type: "dropped", id: null, count: -1 }],
    ["drop source", { type: "dropped", id: { kind: "", instance: "api" }, count: 1 }],
    ["successful detail", { type: "detail-result", requestId: "r1", ok: true, seq: 1 }],
    ["successful command", { type: "command-result", requestId: "r1", ok: true, value: undefined }],
    ["failed result", { type: "command-result", requestId: "r1", ok: false }],
  ])("rejects a malformed %s message", (_name, message) => {
    expect(isErr(validateMessageEnvelope(envelope(message)))).toBe(true)
  })
})

describe("validateRequestEnvelope", () => {
  it("accepts a detail request", () => {
    const result = validateRequestEnvelope({
      protocol: PROTOCOL_VERSION,
      request: { type: "detail-request", requestId: "r1", id, ref: "abc" },
    })
    expect(isOk(result)).toBe(true)
  })

  it("accepts a cancel request", () => {
    const result = validateRequestEnvelope({
      protocol: PROTOCOL_VERSION,
      request: { type: "cancel", requestId: "r1" },
    })
    expect(isOk(result)).toBe(true)
  })

  it("rejects a command request with a missing id", () => {
    const result = validateRequestEnvelope({
      protocol: PROTOCOL_VERSION,
      request: { type: "command-request", requestId: "r1", commandId: "reset", input: null },
    })
    expect(isErr(result)).toBe(true)
  })

  it.each([
    ["empty request id", { type: "cancel", requestId: "" }],
    ["empty detail ref", { type: "detail-request", requestId: "r1", id, ref: "" }],
    [
      "empty command id",
      { type: "command-request", requestId: "r1", id, commandId: "", input: null },
    ],
    [
      "non-serializable command input",
      { type: "command-request", requestId: "r1", id, commandId: "reset", input: undefined },
    ],
  ])("rejects a malformed request with %s", (_name, request) => {
    expect(isErr(validateRequestEnvelope({ protocol: PROTOCOL_VERSION, request }))).toBe(true)
  })
})
