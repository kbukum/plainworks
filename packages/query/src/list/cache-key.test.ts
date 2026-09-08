import type { ListQueryParams } from "@plainworks/http"
import { hashKey } from "@tanstack/query-core"
import { describe, expect, it } from "vitest"
import { infiniteListQueryKey, listQueryKey } from "./cache-key"

const hash = (params: ListQueryParams): string => hashKey(listQueryKey("items", params))

/** Drop one key entirely — expresses "absent" without an explicit `undefined` (exactOptionalPropertyTypes). */
function omit(params: ListQueryParams, key: keyof ListQueryParams): ListQueryParams {
  const { [key]: _dropped, ...rest } = params
  return rest
}

describe("listQueryKey", () => {
  it("is deterministic — equal params produce a deeply-equal key", () => {
    const params: ListQueryParams = {
      filters: [{ field: "status", op: "eq", value: "active" }],
      page: 2,
      sortBy: "createdAt",
      order: "desc",
    }
    expect(listQueryKey("items", params)).toEqual(listQueryKey("items", params))
  })

  it("is order-independent in the filter set", () => {
    const a: ListQueryParams = {
      filters: [
        { field: "status", op: "eq", value: "active" },
        { field: "price", op: "gte", value: 10 },
      ],
    }
    const b: ListQueryParams = {
      filters: [
        { field: "price", op: "gte", value: 10 },
        { field: "status", op: "eq", value: "active" },
      ],
    }
    expect(hash(a)).toBe(hash(b))
  })

  it("is order-independent in the includes and facets sets", () => {
    // Includes/facets are unordered request sets: the same list written two ways must share a key,
    // or identical requests duplicate cache entries and refetch.
    const a: ListQueryParams = { includes: ["author", "comments"], facets: ["status", "price"] }
    const b: ListQueryParams = { includes: ["comments", "author"], facets: ["price", "status"] }
    expect(hash(a)).toBe(hash(b))
    // ...while a genuinely different set still keys distinctly.
    expect(hash(a)).not.toBe(hash({ includes: ["author"], facets: ["status", "price"] }))
  })

  it("keys distinctly across filter, page, sort, and search variations", () => {
    const base: ListQueryParams = {
      filters: [{ field: "status", op: "eq", value: "active" }],
      page: 1,
    }
    const variants: ListQueryParams[] = [
      base,
      { ...base, filters: [{ field: "status", op: "eq", value: "archived" }] },
      { ...base, page: 2 },
      { ...base, sortBy: "name" },
      { ...base, search: "widget" },
      { filters: [{ field: "status", op: "neq", value: "active" }], page: 1 },
    ]
    const hashes = new Set(variants.map(hash))
    expect(hashes.size).toBe(variants.length)
  })

  it("scopes the key by resource name", () => {
    const params: ListQueryParams = { page: 1 }
    expect(hashKey(listQueryKey("items", params))).not.toBe(hashKey(listQueryKey("orders", params)))
  })

  it("honors a custom key prefix", () => {
    const key = listQueryKey("items", { page: 1 }, { keyPrefix: ["app"] })
    expect(key[0]).toBe("app")
  })

  it("folds every canonical field into the key and omits empty ones", () => {
    const full: ListQueryParams = {
      filters: [{ field: "status", op: "eq", value: "active" }],
      page: 1,
      pageSize: 20,
      sortBy: "createdAt",
      order: "desc",
      search: "widget",
      includes: ["author"],
      facets: ["status"],
    }
    // Empty collections must not change the key vs. their absence.
    const emptied: ListQueryParams = { ...full, includes: [], facets: [] }
    expect(hash(omit(omit(full, "includes"), "facets"))).toBe(hash(emptied))
    // Each populated field must contribute — dropping any one changes the key.
    for (const field of ["pageSize", "order", "includes", "facets"] as const) {
      expect(hash(full)).not.toBe(hash(omit(full, field)))
    }
  })

  it("breaks filter ties by operator then by value, arrays kept in order", () => {
    const sameFieldDiffOp = (op: "eq" | "neq"): ListQueryParams => ({
      filters: [
        { field: "status", op, value: "a" },
        { field: "status", op: "eq", value: "b" },
      ],
    })
    expect(hash(sameFieldDiffOp("eq"))).not.toBe(hash(sameFieldDiffOp("neq")))
    const arr = (values: string[]): ListQueryParams => ({
      filters: [{ field: "tags", op: "in", value: values }],
    })
    expect(hash(arr(["a", "b"]))).not.toBe(hash(arr(["b", "a"])))
  })

  it("distinguishes values that naive stringification would collapse", () => {
    // 1 vs "1" — different types must key differently.
    const num: ListQueryParams = { filters: [{ field: "id", op: "eq", value: 1 }] }
    const str: ListQueryParams = { filters: [{ field: "id", op: "eq", value: "1" }] }
    expect(hash(num)).not.toBe(hash(str))
    // ["a,b", "c"] vs ["a", "b,c"] — comma placement must key differently.
    const ab: ListQueryParams = { filters: [{ field: "t", op: "in", value: ["a,b", "c"] }] }
    const ba: ListQueryParams = { filters: [{ field: "t", op: "in", value: ["a", "b,c"] }] }
    expect(hash(ab)).not.toBe(hash(ba))
  })
})

describe("infiniteListQueryKey", () => {
  it("shares one key across pages — page and cursor do not change it", () => {
    const a: ListQueryParams = {
      filters: [{ field: "status", op: "eq", value: "x" }],
      cursor: "p1",
    }
    const b: ListQueryParams = {
      filters: [{ field: "status", op: "eq", value: "x" }],
      cursor: "p2",
      page: 5,
    }
    expect(hashKey(infiniteListQueryKey("items", a))).toBe(
      hashKey(infiniteListQueryKey("items", b)),
    )
  })

  it("keys distinctly by initialCursor", () => {
    const params: ListQueryParams = { pageSize: 10 }
    expect(hashKey(infiniteListQueryKey("items", params, { initialCursor: "a" }))).not.toBe(
      hashKey(infiniteListQueryKey("items", params, { initialCursor: "b" })),
    )
  })

  it("normalizes the omitted initial cursor — omission and the empty cursor key identically", () => {
    // Both are the same first-page request (`infiniteListQueryOptions` fetches omission as `""`),
    // so they must not split one list across two cache entries.
    const params: ListQueryParams = { pageSize: 10 }
    expect(hashKey(infiniteListQueryKey("items", params))).toBe(
      hashKey(infiniteListQueryKey("items", params, { initialCursor: "" })),
    )
  })

  it("still keys distinctly on a filter change", () => {
    const a: ListQueryParams = { filters: [{ field: "status", op: "eq", value: "x" }] }
    const b: ListQueryParams = { filters: [{ field: "status", op: "eq", value: "y" }] }
    expect(hashKey(infiniteListQueryKey("items", a))).not.toBe(
      hashKey(infiniteListQueryKey("items", b)),
    )
  })

  it("differs from the offset key for the same params", () => {
    const params: ListQueryParams = { filters: [{ field: "status", op: "eq", value: "x" }] }
    expect(hashKey(infiniteListQueryKey("items", params))).not.toBe(
      hashKey(listQueryKey("items", params)),
    )
  })
})
