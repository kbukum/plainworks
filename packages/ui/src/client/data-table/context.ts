"use client"

import { type Context, createContext, type ReactNode, use } from "react"
import type { ColumnAlign, DataTableIcons, DataTableLabels } from "./columns"

/** A column reduced to what the header renders — the `Row` generic is erased at this seam. */
export interface DataTableHeaderModel {
  readonly id: string
  readonly header: ReactNode
  readonly sortable: boolean
  readonly align: ColumnAlign
  readonly priority?: "high" | "low" | undefined
  /** ARIA sort state for this column's `<th>`, present only for the active sorted column. */
  readonly ariaSort?: "ascending" | "descending" | undefined
}

/** A single rendered cell, pre-projected so the body view is not generic. */
export interface DataTableCellModel {
  readonly columnId: string
  /** The column header, repeated as the term when the cell moves into the row detail. */
  readonly header: ReactNode
  readonly align: ColumnAlign
  readonly content: ReactNode
  readonly priority?: "high" | "low" | undefined
  readonly nowrap: boolean
}

/** A row reduced to its stable id, pre-rendered cells, and accessible control labels. */
export interface DataTableRowModel {
  readonly id: string
  /** DOM id of the row's detail row, referenced by its disclosure button while expanded. */
  readonly detailId: string
  readonly cells: readonly DataTableCellModel[]
  readonly selectAriaLabel: string
  readonly detailsAriaLabel: string
}

/**
 * The non-generic view model shared with the internal header/body pieces through {@link use}. The
 * `Row` generic is erased when `DataTable` builds this value, which keeps a single module-level
 * context usable across every row type without an `any`.
 */
export interface DataTableContextValue {
  readonly columns: readonly DataTableHeaderModel[]
  readonly rows: readonly DataTableRowModel[]
  readonly labels: DataTableLabels
  readonly icons: DataTableIcons
  readonly selectable: boolean
  /** True when some column is low priority, so narrow rows carry a detail disclosure. */
  readonly hasDetails: boolean
  readonly isRowExpanded: (id: string) => boolean
  readonly toggleRowDetails: (id: string) => void
  /** Close every open row detail, once the container is wide enough to show all columns. */
  readonly collapseRowDetails: () => void
  /** The zero-row view. */
  readonly empty: ReactNode
  readonly loading: boolean
  readonly loadingRowCount: number
  /** Number of `<td>`s a full-width row (empty/loading) must span. */
  readonly columnSpan: number
  readonly isRowSelected: (id: string) => boolean
  readonly toggleRow: (id: string) => void
  readonly allSelected: boolean
  readonly someSelected: boolean
  readonly toggleAll: () => void
  readonly requestSort: (columnId: string) => void
}

const DataTableContext: Context<DataTableContextValue | null> =
  createContext<DataTableContextValue | null>(null)

/** Read the {@link DataTableContextValue}, throwing a typed error when used outside `DataTable`. */
export function useDataTableContext(): DataTableContextValue {
  const value = use(DataTableContext)
  if (value === null) {
    throw new Error("DataTable compound parts must be rendered inside <DataTable>.")
  }
  return value
}

export { DataTableContext }
