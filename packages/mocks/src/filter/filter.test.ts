import { buildListQuery, type ListFilter } from "@plainworks/http/list"
import { describe, expect, it } from "vitest"
import { parseApiParams } from "./api"

/** Flatten the builder's `QueryParams` into the `Record<string, string>` shape the parser consumes. */
function flatten(params: Record<string, unknown>): Record<string, string> {
  const flat: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      // Repeated keys (range filters) arrive as an array; the parser sees each occurrence on its own.
      for (const item of value) {
        flat[key] = String(item)
      }
    } else if (value !== undefined) {
      flat[key] = String(value)
    }
  }
  return flat
}

describe("parseApiParams", () => {
  it("parses a simple op.value condition", () => {
    expect(parseApiParams({ status: "eq.active" })).toEqual({
      conditions: [{ field: "status", operator: "eq", value: "active" }],
    })
  })

  it("parses null checks", () => {
    expect(parseApiParams({ deletedAt: "is.null" }).conditions[0]).toEqual({
      field: "deletedAt",
      operator: "null",
      value: null,
    })
    expect(parseApiParams({ deletedAt: "not.is.null" }).conditions[0]).toEqual({
      field: "deletedAt",
      operator: "notNull",
      value: null,
    })
  })

  it("rejects a presence token carrying a suffix — the value-less token must end exactly", () => {
    // These params are untrusted: `not.is.null.foo` must not silently apply a `notNull` filter.
    expect(parseApiParams({ deletedAt: "not.is.null.foo" }).conditions).toHaveLength(0)
    expect(parseApiParams({ deletedAt: "is.null.true" }).conditions).toHaveLength(0)
  })

  it("parses array values with escaped commas", () => {
    expect(parseApiParams({ role: "in.(admin,editor)" }).conditions[0]?.value).toEqual([
      "admin",
      "editor",
    ])
    expect(parseApiParams({ tag: "in.(a\\,b,c)" }).conditions[0]?.value).toEqual(["a,b", "c"])
  })

  it("parses the multi-segment `not.in` token as `nin` (not dropped as unknown `not`)", () => {
    expect(parseApiParams({ role: "not.in.(admin,editor)" }).conditions[0]).toEqual({
      field: "role",
      operator: "nin",
      value: ["admin", "editor"],
    })
  })

  it("parses a parenthesized scalar as a scalar — parentheses are data outside `in`/`nin`", () => {
    // A scalar operator never takes the array form: `eq.(foo)` is the literal value `(foo)`.
    expect(parseApiParams({ label: "eq.(foo)" }).conditions[0]).toEqual({
      field: "label",
      operator: "eq",
      value: "(foo)",
    })
  })

  it("rejects a bare membership remainder — `in`/`nin` are always parenthesized on the wire", () => {
    expect(parseApiParams({ role: "in.admin" }).conditions).toHaveLength(0)
    expect(parseApiParams({ role: "not.in.admin" }).conditions).toHaveLength(0)
  })

  it("round-trips a literal backslash escaped by the http builder (`\\\\` → `\\`)", () => {
    // The http builder emits `a\\b` for the value `a\b`; the parser must collapse it.
    expect(parseApiParams({ path: "eq.a\\\\b" }).conditions[0]?.value).toBe("a\\b")
    // And inside a list value, too.
    expect(parseApiParams({ tag: "in.(a\\\\b,c)" }).conditions[0]?.value).toEqual(["a\\b", "c"])
  })

  it("unescapes parentheses and commas in scalar values", () => {
    expect(parseApiParams({ label: "eq.foo\\(bar\\)" }).conditions[0]?.value).toBe("foo(bar)")
  })

  it("skips values that are not recognised conditions", () => {
    expect(parseApiParams({ a: "novalue", b: "bogus.x" }).conditions).toEqual([])
  })
})

describe("buildListQuery ↔ parseApiParams round trip", () => {
  const roundTrip = (filters: readonly ListFilter[]) =>
    parseApiParams(flatten(buildListQuery({ filters }))).conditions

  it("round-trips every operator shape the builder emits", () => {
    expect(
      roundTrip([
        { field: "status", op: "eq", value: "active" },
        { field: "price", op: "gte", value: 10 },
        { field: "role", op: "in", value: ["admin", "editor"] },
        { field: "tier", op: "nin", value: ["guest"] },
        { field: "deletedAt", op: "null" },
        { field: "updatedAt", op: "notNull" },
      ]),
    ).toEqual([
      { field: "status", operator: "eq", value: "active" },
      { field: "price", operator: "gte", value: "10" },
      { field: "role", operator: "in", value: ["admin", "editor"] },
      { field: "tier", operator: "nin", value: ["guest"] },
      { field: "deletedAt", operator: "null", value: null },
      { field: "updatedAt", operator: "notNull", value: null },
    ])
  })

  it("round-trips values carrying the wire's metacharacters", () => {
    expect(
      roundTrip([
        { field: "label", op: "eq", value: "(foo)" },
        { field: "path", op: "eq", value: "a\\b" },
        { field: "tag", op: "in", value: ["a,b", "c\\d"] },
      ]),
    ).toEqual([
      { field: "label", operator: "eq", value: "(foo)" },
      { field: "path", operator: "eq", value: "a\\b" },
      { field: "tag", operator: "in", value: ["a,b", "c\\d"] },
    ])
  })
})
