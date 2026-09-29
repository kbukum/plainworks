import { describe, expect, test } from "vitest"
import { escapeJsonForHtml, isJson, JsonEncodeError, stringifyJson, toBoundedJson } from "./json"

function sparseArray(): unknown[] {
  const value: unknown[] = []
  value[2] = 3
  return value
}

function cyclic(): Record<string, unknown> {
  const value: Record<string, unknown> = { name: "loop" }
  value.self = value
  return value
}

describe("isJson", () => {
  test.each([
    null,
    true,
    0,
    "text",
    [],
    [1, "two", { three: [null] }],
    { nested: { list: [false] } },
    Object.create(null),
  ])("accepts the JSON value %j", (value) => {
    expect(isJson(value)).toBe(true)
  })

  test.each([
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    1n,
    Symbol("s"),
    () => 1,
    new Date(0),
    new Map(),
    { nested: undefined },
    [undefined],
    // A sparse array would serialize its hole as `null`, so it is not a faithful JSON value.
    sparseArray(),
  ])("rejects %s", (value) => {
    expect(isJson(value)).toBe(false)
  })

  test("rejects a cycle", () => {
    expect(isJson(cyclic())).toBe(false)
  })

  test("accepts a shared, non-cyclic reference", () => {
    const shared = { id: 1 }
    expect(isJson({ a: shared, b: shared })).toBe(true)
  })

  test("never runs a getter", () => {
    let calls = 0
    const value = {
      get secret() {
        calls += 1
        return "x"
      },
    }
    expect(isJson(value)).toBe(false)
    expect(calls).toBe(0)
  })

  test("rejects a hidden toJSON, which would rewrite the value when serialized", () => {
    const value = { safe: true }
    Object.defineProperty(value, "toJSON", { value: () => ({ injected: true }) })
    expect(isJson(value)).toBe(false)
    const list: unknown[] = [1]
    Object.defineProperty(list, "toJSON", { value: () => "other" })
    expect(isJson(list)).toBe(false)
  })

  test("returns false, not a throw, for a hostile proxy", () => {
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("trap")
        },
      },
    )
    expect(isJson({ hostile })).toBe(false)
  })
})

describe("stringifyJson", () => {
  test("serializes a JSON value", () => {
    expect(stringifyJson({ a: [1, "b", null], c: { d: true } })).toBe(
      '{"a":[1,"b",null],"c":{"d":true}}',
    )
  })

  test("honors toJSON, as JSON.stringify does", () => {
    expect(stringifyJson({ at: new Date(0) })).toBe('{"at":"1970-01-01T00:00:00.000Z"}')
  })

  test.each([
    ["a top-level undefined", undefined],
    ["a function", { run: () => 1 }],
    ["a symbol", { tag: Symbol("t") }],
    ["a BigInt", { big: 1n }],
    ["NaN", { n: Number.NaN }],
    ["Infinity", [Number.POSITIVE_INFINITY]],
    ["an undefined property", { missing: undefined }],
    ["an undefined array item", [undefined]],
  ])("throws a typed error for %s instead of dropping it", (_label, value) => {
    expect(() => stringifyJson(value)).toThrow(JsonEncodeError)
  })

  test("wraps a cycle's native TypeError as the cause", () => {
    let caught: unknown
    try {
      stringifyJson(cyclic())
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(JsonEncodeError)
    expect(caught).toMatchObject({ kind: "std/json-encode" })
    expect((caught as JsonEncodeError).cause).toBeInstanceOf(TypeError)
  })

  test("omits undefined properties when asked, but still rejects other lossy values", () => {
    expect(stringifyJson({ a: 1, b: undefined }, { omitUndefined: true })).toBe('{"a":1}')
    expect(() => stringifyJson([undefined], { omitUndefined: true })).toThrow(JsonEncodeError)
    expect(() => stringifyJson(undefined, { omitUndefined: true })).toThrow(JsonEncodeError)
    expect(() => stringifyJson({ f: () => 1 }, { omitUndefined: true })).toThrow(JsonEncodeError)
    expect(stringifyJson({ "": undefined, a: 1 }, { omitUndefined: true })).toBe('{"a":1}')
  })
})

describe("escapeJsonForHtml", () => {
  test("escapes characters that could end a script element or a JS string", () => {
    const json = stringifyJson({ note: "</script><b>&</b>\u2028\u2029" })
    const escaped = escapeJsonForHtml(json)
    expect(escaped).not.toMatch(/[<>&\u2028\u2029]/)
    expect(JSON.parse(escaped)).toEqual(JSON.parse(json))
  })
})

describe("toBoundedJson", () => {
  test("keeps a small JSON value as is", () => {
    expect(toBoundedJson({ a: [1, "b"], c: null })).toEqual({ a: [1, "b"], c: null })
  })

  test("coerces values JSON cannot hold to safe stand-ins", () => {
    expect(
      toBoundedJson({
        big: 12n,
        at: new Date(0),
        bad: new Date(Number.NaN),
        run: () => 1,
        nan: Number.NaN,
        skip: undefined,
        map: new Map([[1, 2]]),
      }),
    ).toEqual({
      big: "12",
      at: "1970-01-01T00:00:00.000Z",
      bad: null,
      run: "[Function]",
      nan: null,
      map: "[Truncated]",
    })
  })

  test("marks cycles instead of recursing forever", () => {
    expect(toBoundedJson(cyclic())).toEqual({ name: "loop", self: "[Circular]" })
  })

  test("truncates past maxDepth", () => {
    expect(toBoundedJson({ a: { b: { c: 1 } } }, { maxDepth: 2 })).toEqual({
      a: { b: "[Truncated]" },
    })
  })

  test("caps collections at maxItems", () => {
    expect(toBoundedJson([1, 2, 3, 4], { maxItems: 2 })).toEqual([1, 2, "[+2 more]"])
    expect(toBoundedJson({ a: 1, b: 2, c: 3 }, { maxItems: 2 })).toEqual({ a: 1, b: 2 })
  })

  test("replaces a result larger than maxBytes, counted in UTF-8 bytes", () => {
    expect(toBoundedJson("€€", { maxBytes: 7 })).toBe("[Truncated]")
    expect(toBoundedJson("€€", { maxBytes: 8 })).toBe("€€")
  })

  test("stops reading once the byte budget is spent", () => {
    let reads = 0
    const entries = Array.from({ length: 100 }, () => "x".repeat(1024))
    const counted = new Proxy(entries, {
      getOwnPropertyDescriptor(target, key) {
        reads += 1
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
    })
    expect(toBoundedJson(counted, { maxBytes: 2048 })).toBe("[Truncated]")
    expect(reads).toBeLessThan(5)
  })

  test("keeps a __proto__ key as data, never as the result's prototype", () => {
    const input: unknown = JSON.parse('{"__proto__":{"admin":true},"name":"x"}')
    const result = toBoundedJson(input) as Record<string, unknown>
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    expect(result.admin).toBeUndefined()
    expect(Object.keys(result)).toEqual(["__proto__", "name"])
    expect(Object.getOwnPropertyDescriptor(result, "__proto__")?.value).toEqual({ admin: true })
  })

  test("surfaces a getter without running it", () => {
    let calls = 0
    const value = {
      get secret() {
        calls += 1
        return "x"
      },
    }
    expect(toBoundedJson(value)).toEqual({ secret: "[Getter]" })
    expect(calls).toBe(0)
  })

  test("never throws on a hostile value", () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("trap")
        },
      },
    )
    expect(toBoundedJson({ hostile })).toEqual({ hostile: "[Truncated]" })
  })

  test.each([
    { maxDepth: -1 },
    { maxDepth: 1.5 },
    { maxItems: -1 },
    { maxBytes: 0 },
    { maxBytes: Number.POSITIVE_INFINITY },
  ])("rejects the invalid bound %j", (options) => {
    expect(() => toBoundedJson(1, options)).toThrow(RangeError)
  })
})
