import { describe, expect, test } from "vitest"
import { jsonSerializer, stringSerializer } from "./serializer"

describe("jsonSerializer", () => {
  test("round-trips a JSON-serializable value", () => {
    const serializer = jsonSerializer<{ theme: string; count: number }>()
    const encoded = serializer.serialize({ theme: "dark", count: 2 })
    expect(encoded).toBe('{"theme":"dark","count":2}')
    expect(serializer.deserialize(encoded)).toEqual({ theme: "dark", count: 2 })
  })

  test("throws on a malformed persisted string rather than fabricating a value", () => {
    expect(() => jsonSerializer<number>().deserialize("{not json")).toThrow()
  })

  test("rejects a value JSON.stringify cannot represent rather than persisting `undefined`", () => {
    // Top-level `undefined`, a function, and a symbol all make `JSON.stringify` return `undefined`
    // (not a string); persisting that would later fail to parse, so serialize must throw instead.
    expect(() => jsonSerializer<unknown>().serialize(undefined)).toThrow(/JSON-serialize/)
    expect(() => jsonSerializer<unknown>().serialize(() => 1)).toThrow(/JSON-serialize/)
    expect(() => jsonSerializer<unknown>().serialize(Symbol("s"))).toThrow(/JSON-serialize/)
  })
})

describe("stringSerializer", () => {
  test("passes a plain string through unquoted in both directions", () => {
    expect(stringSerializer.serialize("dark")).toBe("dark")
    expect(stringSerializer.deserialize("dark")).toBe("dark")
  })
})
