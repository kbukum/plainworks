// @vitest-environment jsdom

import type { ListFilter } from "@plainworks/std"
import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useCatalogList } from "./use-catalog-list"

// The shared catalog list-state engine proven in isolation: every filter, search, or sort change
// must snap back to page one and rebuild `params`, so a user narrowing a list never lands stranded
// past its new last page. Each case starts on page 2+ so a missing reset would show up as a stale
// page carried into the rebuilt query.

const shippedFilter: ListFilter = { field: "status", op: "eq", value: "shipped" }

describe("useCatalogList", () => {
  it("resets to page one and rebuilds params when the filter set changes", () => {
    const { result } = renderHook(() => useCatalogList({ pageSize: 8 }))

    act(() => result.current.setPage(2))
    expect(result.current.page).toBe(2)
    expect(result.current.params.page).toBe(2)

    act(() => result.current.setFilters([shippedFilter]))

    expect(result.current.page).toBe(1)
    expect(result.current.params.page).toBe(1)
    expect(result.current.params.filters).toEqual([shippedFilter])
  })

  it("resets to page one and rebuilds params when the search term changes", () => {
    const { result } = renderHook(() => useCatalogList({ pageSize: 8 }))

    act(() => result.current.setPage(3))
    expect(result.current.page).toBe(3)

    act(() => result.current.setSearch("  ada  "))

    expect(result.current.page).toBe(1)
    expect(result.current.params.page).toBe(1)
    // The rebuilt params carry the trimmed term, not the raw input.
    expect(result.current.params.search).toBe("ada")
  })

  it("resets to page one and rebuilds params when the sort changes", () => {
    const { result } = renderHook(() =>
      useCatalogList({ pageSize: 8, sortBy: "createdAt", order: "desc" }),
    )

    act(() => result.current.setPage(2))
    expect(result.current.page).toBe(2)
    expect(result.current.params.sortBy).toBe("createdAt")
    expect(result.current.params.order).toBe("desc")

    act(() => result.current.setSort({ columnId: "total", direction: "asc" }))

    expect(result.current.page).toBe(1)
    expect(result.current.params.page).toBe(1)
    expect(result.current.params.sortBy).toBe("total")
    expect(result.current.params.order).toBe("asc")
  })

  it("clearing the sort resets to page one and drops the sort keys from params", () => {
    const { result } = renderHook(() =>
      useCatalogList({ pageSize: 8, sortBy: "createdAt", order: "desc" }),
    )

    act(() => result.current.setPage(2))
    act(() => result.current.setSort(null))

    expect(result.current.page).toBe(1)
    expect(result.current.params.sortBy).toBeUndefined()
    expect(result.current.params.order).toBeUndefined()
  })
})
