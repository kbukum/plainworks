"use client"

// Re-export-only barrel for `@plainworks/ui`'s data-table exemplar concern.
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
