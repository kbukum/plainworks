"use client"

// Re-export-only barrel for the `DataTable` component folder (`@plainworks/ui/data/data-table`).
export type {
  ColumnAlign,
  DataTableColumn,
  DataTableIcons,
  DataTableLabels,
  DataTableProps,
  DataTableSort,
  SortDirection,
} from "./columns"
export { defaultDataTableLabels } from "./columns"
export { DataTable } from "./table"
