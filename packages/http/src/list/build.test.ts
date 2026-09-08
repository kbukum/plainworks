import type { ListQueryParams } from "@plainworks/std"
import { describe, expect, it } from "vitest"
import { HttpError } from "../error"
import { buildUrl } from "../url"
import { buildListQuery } from "./build"

/** Build the params and encode them onto a URL, returning the decoded search string for assertions. */
function toSearch(params: ListQueryParams): string {
  const url = new URL(
    buildUrl({
      baseUrl: "https://api.example.com/v1/",
      path: "items",
      query: buildListQuery(params),
    }),
  )
  return decodeURIComponent(url.search)
}

describe("buildListQuery", () => {
  it("serializes each scalar operator to `field=op.value`", () => {
    const cases: Array<[NonNullable<ListQueryParams["filters"]>, string]> = [
      [[{ field: "status", op: "eq", value: "active" }], "status=eq.active"],
      [[{ field: "status", op: "neq", value: "archived" }], "status=neq.archived"],
      [[{ field: "price", op: "gt", value: 10 }], "price=gt.10"],
      [[{ field: "price", op: "gte", value: 10 }], "price=gte.10"],
      [[{ field: "price", op: "lt", value: 99 }], "price=lt.99"],
      [[{ field: "price", op: "lte", value: 99 }], "price=lte.99"],
      [[{ field: "name", op: "like", value: "ap%" }], "name=like.ap%"],
      [[{ field: "name", op: "ilike", value: "AP%" }], "name=ilike.AP%"],
    ]
    for (const [filters, expected] of cases) {
      expect(toSearch({ filters })).toBe(`?${expected}`)
    }
  })

  it("serializes list operators as `in.(a,b,c)` / `not.in.(...)`", () => {
    expect(toSearch({ filters: [{ field: "tags", op: "in", value: ["a", "b", "c"] }] })).toBe(
      "?tags=in.(a,b,c)",
    )
    expect(toSearch({ filters: [{ field: "tags", op: "nin", value: [1, 2] }] })).toBe(
      "?tags=not.in.(1,2)",
    )
  })

  it("serializes presence operators as `is.null` / `not.is.null`", () => {
    expect(toSearch({ filters: [{ field: "name", op: "null" }] })).toBe("?name=is.null")
    expect(toSearch({ filters: [{ field: "name", op: "notNull" }] })).toBe("?name=not.is.null")
  })

  it("escapes the delimiter and escape char in a list value so it round-trips", () => {
    // A comma inside a value must not split it into two: `\,` is one value, `\\` a literal backslash.
    expect(toSearch({ filters: [{ field: "tags", op: "in", value: ["a,b", "c\\d"] }] })).toBe(
      "?tags=in.(a\\,b,c\\\\d)",
    )
  })

  it("rejects an empty-string membership value — it cannot round-trip the wire unambiguously", () => {
    // `[]` and `[""]` would both encode to `in.()` and a trailing empty item would be dropped by the
    // parser, so two distinct cache keys would issue the same request. Reject instead of corrupting.
    expect(() =>
      buildListQuery({ filters: [{ field: "tags", op: "in", value: [""] }] }),
    ).toThrowError(HttpError)
    expect(() =>
      buildListQuery({ filters: [{ field: "tags", op: "nin", value: ["a", ""] }] }),
    ).toThrowError(HttpError)
  })

  it("escapes a literal backslash in a scalar value", () => {
    expect(toSearch({ filters: [{ field: "path", op: "eq", value: "a\\b" }] })).toBe(
      "?path=eq.a\\\\b",
    )
  })

  it("repeats a field carrying several filters (a range)", () => {
    expect(
      toSearch({
        filters: [
          { field: "price", op: "gte", value: 10 },
          { field: "price", op: "lte", value: 20 },
        ],
      }),
    ).toBe("?price=gte.10&price=lte.20")
  })

  it("emits pagination, sort, search, includes, and facets params", () => {
    expect(
      toSearch({
        page: 2,
        pageSize: 25,
        sortBy: "createdAt",
        order: "desc",
        search: "widget",
        includes: ["owner", "tags"],
        facets: ["status"],
      }),
    ).toBe(
      "?page=2&pageSize=25&sortBy=createdAt&order=desc&search=widget&includes=owner,tags&facets=status",
    )
  })

  it("emits a cursor param in cursor mode", () => {
    expect(toSearch({ cursor: "abc123", pageSize: 50 })).toBe("?pageSize=50&cursor=abc123")
  })

  it("omits absent optional params entirely", () => {
    expect(buildListQuery({})).toEqual({})
    expect(buildListQuery({ includes: [] })).toEqual({})
  })

  it("rejects a value-shape that contradicts its operator as a fatal http/request error", () => {
    // Untyped JS callers can construct an invalid combination; the runtime guard catches it.
    const bad = (filter: Record<string, unknown>) => buildListQuery({ filters: [filter as never] })
    expect(() => bad({ field: "tags", op: "in", value: "a" })).toThrow(/requires an array value/)
    expect(() => bad({ field: "status", op: "eq", value: ["a"] })).toThrow(
      /requires a scalar value/,
    )
    expect(() => bad({ field: "name", op: "null", value: "x" })).toThrow(/takes no value/)
  })

  it("rejects page and cursor together as mutually exclusive", () => {
    expect(() => buildListQuery({ page: 1, cursor: "abc" })).toThrow(/mutually exclusive/)
  })

  it("rejects an unknown operator from an untyped caller instead of emitting `undefined.value`", () => {
    expect(() =>
      buildListQuery({ filters: [{ field: "status", op: "bogus", value: "x" } as never] }),
    ).toThrow(/Unknown filter operator 'bogus'/)
  })

  it("rejects a filter whose field collides with a reserved control parameter", () => {
    for (const field of ["page", "pageSize", "cursor", "sortBy", "order", "search"]) {
      expect(() => buildListQuery({ filters: [{ field, op: "eq", value: "x" }] })).toThrow(
        /collides with a reserved list-control parameter/,
      )
    }
  })

  it("serializes field names inherited from Object.prototype without pollution", () => {
    const result = buildListQuery({
      filters: [{ field: "toString", op: "eq", value: "x" }],
    })
    expect(result.toString).toBe("eq.x")
    // A second filter on the same field repeats the key, not overwrites it.
    const multi = buildListQuery({
      filters: [
        { field: "constructor", op: "eq", value: "a" },
        { field: "constructor", op: "neq", value: "b" },
      ],
    })
    expect(multi.constructor).toEqual(["eq.a", "neq.b"])
  })
})
