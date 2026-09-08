import { describe, expect, it } from "vitest"
import { HttpError } from "../error"
import { escapeListValue, escapeScalarValue, parseDelimitedList, unescapeValue } from "./codec"

describe("REST value codec round-trip", () => {
  // The escape (serialize) and unescape (parse) halves must be inverses: whatever the builder
  // emits, the backend parser recovers exactly. These are the delimiter/backslash edge cases that
  // would corrupt a value if the two halves ever drifted.
  const scalarValues = ["plain", "a\\b", "\\", "a\\\\b", "dot.value", "(foo)", "trailing\\"]

  it("recovers a scalar value through escapeScalarValue → unescapeValue", () => {
    for (const value of scalarValues) {
      expect(unescapeValue(escapeScalarValue(value))).toBe(value)
    }
  })

  it("recovers a list of values through escapeListValue → join(',') → parseDelimitedList", () => {
    const lists: string[][] = [
      ["a", "b", "c"],
      ["a,b", "c"],
      ["a\\b", "c,d"],
      ["\\", ",", "\\,"],
      ["only"],
    ]
    for (const values of lists) {
      const wire = values.map(escapeListValue).join(",")
      expect(parseDelimitedList(wire)).toEqual(values)
    }
  })

  it("escapes the delimiter and escape char so a list value never splits", () => {
    expect(escapeListValue("a,b")).toBe("a\\,b")
    expect(escapeListValue("c\\d")).toBe("c\\\\d")
  })

  it("splits a plain comma list without escapes", () => {
    expect(parseDelimitedList("admin,editor")).toEqual(["admin", "editor"])
  })

  it("preserves a dangling escape as a literal backslash, like unescapeValue", () => {
    // A terminal `\` has nothing to escape; dropping it would silently change the filter's meaning.
    expect(parseDelimitedList("admin\\")).toEqual(["admin\\"])
    expect(parseDelimitedList("\\")).toEqual(["\\"])
    expect(unescapeValue("admin\\")).toBe("admin\\")
  })

  it("rejects an empty list value at the escape boundary", () => {
    // An empty value cannot round-trip: `[]` and `[""]` would share the `in.()` wire form, so the
    // serialize side refuses it rather than emitting an ambiguous wire.
    expect(() => escapeListValue("")).toThrowError(HttpError)
  })

  it("is lossless on the parse side — an empty body is the empty list, empty items survive", () => {
    // `in.()` round-trips the empty list; a hand-crafted empty item between delimiters is
    // preserved, never silently dropped into a different filter.
    expect(parseDelimitedList("")).toEqual([])
    expect(parseDelimitedList("a,")).toEqual(["a", ""])
    expect(parseDelimitedList(",")).toEqual(["", ""])
    expect(parseDelimitedList([].map(escapeListValue).join(","))).toEqual([])
  })
})
