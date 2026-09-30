"use client"

import type { ListFilter, ListQueryParams, SortDirection } from "@plainworks/std/list"
import { useMemo, useState } from "react"
import type { DataTableSort } from "./data-table"

/** The fixed request shape a list starts from: page size, default sort, and facets. */
export interface ListQueryBase {
  /** Rows per page. */
  readonly pageSize: number
  /** Default sort field applied until the user sorts a column. */
  readonly sortBy?: string
  /** Default sort direction. */
  readonly order?: SortDirection
  /** Facet fields to request counts for on every page. */
  readonly facets?: readonly string[]
}

/** The live list state a list drives its query and controls from. */
export interface ListQueryState {
  /** The assembled {@link ListQueryParams} — spread straight into the list plan. */
  readonly params: ListQueryParams
  /** The current 1-based page. */
  readonly page: number
  /** Jump to a page without touching filters, search, or sort. */
  readonly setPage: (page: number) => void
  /** The current filter set (facet selections). */
  readonly filters: readonly ListFilter[]
  /** Replace the filter set; resets to page one so the user never lands past the new last page. */
  readonly setFilters: (next: readonly ListFilter[]) => void
  /** The current free-text search term. */
  readonly search: string
  /** Replace the search term; resets to page one. */
  readonly setSearch: (next: string) => void
  /** The active column sort, or `null` for the backend default. */
  readonly sort: DataTableSort | null
  /** Replace the sort; resets to page one. */
  readonly setSort: (next: DataTableSort | null) => void
}

/**
 * The filter, search, sort, and page state of a list, plus the {@link ListQueryParams} that key its
 * query. Any filter, search, or sort change returns to page one, so a narrowed list never strands
 * the user past its last page. It renders nothing, so a table and a card grid use it alike.
 */
export function useListQueryState(base: ListQueryBase): ListQueryState {
  const [filters, setFiltersState] = useState<readonly ListFilter[]>([])
  const [search, setSearchState] = useState("")
  const [sort, setSortState] = useState<DataTableSort | null>(
    base.sortBy === undefined ? null : { columnId: base.sortBy, direction: base.order ?? "asc" },
  )
  const [page, setPage] = useState(1)

  const params = useMemo<ListQueryParams>(
    () => ({
      page,
      pageSize: base.pageSize,
      ...(sort ? { sortBy: sort.columnId, order: sort.direction } : {}),
      ...(filters.length > 0 ? { filters } : {}),
      ...(search.trim() !== "" ? { search: search.trim() } : {}),
      ...(base.facets !== undefined ? { facets: base.facets } : {}),
    }),
    [page, base.pageSize, base.facets, sort, filters, search],
  )

  return {
    params,
    page,
    setPage,
    filters,
    setFilters: (next) => {
      setFiltersState(next)
      setPage(1)
    },
    search,
    setSearch: (next) => {
      setSearchState(next)
      setPage(1)
    },
    sort,
    setSort: (next) => {
      setSortState(next)
      setPage(1)
    },
  }
}
