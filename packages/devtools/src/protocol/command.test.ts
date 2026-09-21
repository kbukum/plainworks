import { isErr, isOk } from "@plainworks/std"
import { describe, expect, it } from "vitest"
import { parseCommandInput } from "./command"

describe("parseCommandInput", () => {
  it("accepts serializable input", () => {
    const result = parseCommandInput({ latencyMs: 200, enabled: true })
    expect(isOk(result)).toBe(true)
  })

  it("accepts absent input as null", () => {
    const result = parseCommandInput(undefined)
    expect(isOk(result) && result.value).toBe(null)
  })

  it("rejects a function payload with a typed error", () => {
    const result = parseCommandInput({ run: () => 1 })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.kind).toBe("devtools/command-input-unsupported")
  })

  it("rejects a cyclic payload", () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(isErr(parseCommandInput(cyclic))).toBe(true)
  })
})
