import { describe, expect, test } from "vitest"
import { isCursorInfo, isCursorResult, isFacets, isPageInfo, isPaginatedResult } from "./guards"

const isRow = (value: unknown): value is { readonly id: string } =>
  typeof value === "object" && value !== null && typeof (value as { id?: unknown }).id === "string"

const pagination = { page: 1, pageSize: 10, total: 1, totalPages: 1 }
const cursorPagination = { pageSize: 10, nextCursor: "c2", prevCursor: null }

describe("isPageInfo", () => {
  test("accepts a complete offset block", () => {
    expect(isPageInfo(pagination)).toBe(true)
  })

  test("rejects a block missing a required field", () => {
    expect(isPageInfo({ page: 1, total: 1 })).toBe(false)
    expect(isPageInfo({ ...pagination, totalPages: "1" })).toBe(false)
    expect(isPageInfo(null)).toBe(false)
  })
})

describe("isCursorInfo", () => {
  test("accepts string or null cursors", () => {
    expect(isCursorInfo(cursorPagination)).toBe(true)
    expect(isCursorInfo({ pageSize: 5, nextCursor: null, prevCursor: null })).toBe(true)
  })

  test("rejects an absent or mistyped cursor", () => {
    expect(isCursorInfo({ pageSize: 5, nextCursor: null })).toBe(false)
    expect(isCursorInfo({ pageSize: 5, nextCursor: 1, prevCursor: null })).toBe(false)
  })
})

describe("isFacets", () => {
  test("accepts nested count maps", () => {
    expect(isFacets({ status: { open: 2, done: 1 } })).toBe(true)
    expect(isFacets({})).toBe(true)
  })

  test("rejects non-numeric counts", () => {
    expect(isFacets({ status: { open: "2" } })).toBe(false)
    expect(isFacets({ status: "open" })).toBe(false)
  })
})

describe("isPaginatedResult", () => {
  test("accepts a well-formed envelope, with or without facets", () => {
    expect(isPaginatedResult({ data: [{ id: "a" }], pagination }, isRow)).toBe(true)
    expect(
      isPaginatedResult({ data: [], pagination, facets: { status: { open: 1 } } }, isRow),
    ).toBe(true)
  })

  test("rejects a malformed row, pagination block, or facets block", () => {
    expect(isPaginatedResult({ data: [{ id: 1 }], pagination }, isRow)).toBe(false)
    expect(isPaginatedResult({ data: [], pagination: { page: 1, total: 1 } }, isRow)).toBe(false)
    expect(isPaginatedResult({ data: [], pagination, facets: "bad" }, isRow)).toBe(false)
  })
})

describe("isCursorResult", () => {
  test("accepts a well-formed cursor envelope", () => {
    expect(isCursorResult({ data: [{ id: "a" }], pagination: cursorPagination }, isRow)).toBe(true)
  })

  test("rejects a malformed cursor block or facets block", () => {
    expect(isCursorResult({ data: [], pagination }, isRow)).toBe(false)
    expect(
      isCursorResult({ data: [], pagination: cursorPagination, facets: { a: 1 } }, isRow),
    ).toBe(false)
  })
})
