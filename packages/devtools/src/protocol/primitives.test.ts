import { describe, expect, it } from "vitest"
import { sourceIdEquals, sourceKey } from "./identity"
import { isSeverity } from "./severity"
import { isCompatibleProtocol, PROTOCOL_VERSION } from "./version"

describe("version", () => {
  it("accepts only the exact current version", () => {
    expect(isCompatibleProtocol(PROTOCOL_VERSION)).toBe(true)
    expect(isCompatibleProtocol(PROTOCOL_VERSION + 1)).toBe(false)
    expect(isCompatibleProtocol("1")).toBe(false)
    expect(isCompatibleProtocol(undefined)).toBe(false)
  })
})

describe("identity", () => {
  it("keys distinct pairs without collision", () => {
    const a = sourceKey({ kind: "a", instance: "b:c" })
    const b = sourceKey({ kind: "a:b", instance: "c" })
    expect(a).not.toBe(b)

    const nulInInstance = sourceKey({ kind: "a", instance: "b\u0000c" })
    const nulInKind = sourceKey({ kind: "a\u0000b", instance: "c" })
    expect(nulInInstance).not.toBe(nulInKind)
  })

  it("compares source ids structurally", () => {
    expect(sourceIdEquals({ kind: "x", instance: "1" }, { kind: "x", instance: "1" })).toBe(true)
    expect(sourceIdEquals({ kind: "x", instance: "1" }, { kind: "x", instance: "2" })).toBe(false)
  })
})

describe("severity", () => {
  it("recognizes the fixed scale", () => {
    expect(isSeverity("ok")).toBe(true)
    expect(isSeverity("error")).toBe(true)
    expect(isSeverity("fatal")).toBe(false)
    expect(isSeverity(3)).toBe(false)
  })
})
