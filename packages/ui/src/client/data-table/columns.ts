import type { ReactNode, Ref } from "react"

/** Cell/column content alignment, mapped to CSS logical `text-align` (`start`/`center`/`end`). */
export type ColumnAlign = "start" | "center" | "end"

/** The sort direction a column can be ordered by. A `null` sort state means "unsorted". */
export type SortDirection = "asc" | "desc"

/** The active sort: which column, and the direction. `null` when nothing is sorted. */
export interface DataTableSort {
  readonly columnId: string
  readonly direction: SortDirection
}

/**
 * A single column definition. `cell` projects a row to its rendered content, so the table never
 * assumes a shape for `Row` — the caller owns projection and can render any {@link ReactNode}.
 */
export interface DataTableColumn<Row> {
  /** Stable identifier, also used as the sort key reported through `onSortChange`. */
  readonly id: string
  /** Header content. A {@link ReactNode} so callers can inject their own markup. */
  readonly header: ReactNode
  /** Projects a row to the cell content for this column. */
  readonly cell: (row: Row) => ReactNode
  /** When true, the header renders a sort button and participates in the sort cycle. */
  readonly sortable?: boolean
  /** Text alignment for this column's header and cells. Defaults to `start`. */
  readonly align?: ColumnAlign
  /**
   * Display priority for container-query responsive presentation. When set to `low`, the column
   * is hidden in narrow containers (`@max-sm:hidden`) to eliminate horizontal scrolling.
   */
  readonly priority?: "high" | "low" | undefined
}

/**
 * Every user-facing string, injected so the table ships no hardcoded copy. All fields have English
 * defaults ({@link defaultDataTableLabels}); a caller overrides any subset through the `labels`
 * prop.
 */
export interface DataTableLabels {
  /** Accessible name for the header select-all checkbox. */
  readonly selectAllRows: string
  /**
   * Accessible name for a per-row selection checkbox, or a formatter taking the row identifier.
   * Defaults to formatting `Select row ${rowId}`.
   */
  readonly selectRow: string | ((rowId: string) => string)
  /** Announced (screen-reader only) when a column is sorted ascending. */
  readonly sortAscending: string
  /** Announced (screen-reader only) when a column is sorted descending. */
  readonly sortDescending: string
  /** Title shown in the empty state when there are no rows. */
  readonly emptyTitle: string
  /** Description shown in the empty state when there are no rows. */
  readonly emptyDescription: string
  /** Accessible name for the loading region while skeleton rows render. */
  readonly loading: string
}

/**
 * Icon slots, injected as {@link ReactNode} so the table never imports an icon library. Every slot
 * is optional: with none provided the table remains fully operable and accessible through its
 * injected labels and `aria-sort`.
 */
export interface DataTableIcons {
  /** Shown in a sortable header when that column is sorted ascending. */
  readonly sortAscending?: ReactNode
  /** Shown in a sortable header when that column is sorted descending. */
  readonly sortDescending?: ReactNode
  /** Shown in a sortable header when that column is not the active sort column. */
  readonly sortable?: ReactNode
}

/** Props for {@link DataTable}. Controlled-first: a defined `sort`/`selectedKeys` prop wins. */
export interface DataTableProps<Row> {
  /** Column definitions, in display order. */
  readonly columns: readonly DataTableColumn<Row>[]
  /**
   * Rows to render, already in their display order. The table owns sort *state* and reports changes
   * through `onSortChange`; it never reorders `rows` itself, so remote/paged data stays a prop.
   * Callers page or slice `rows` to bound rendered DOM nodes.
   */
  readonly rows: readonly Row[]
  /** Derives a stable string key for a row, used for React keys and selection. */
  readonly getRowId: (row: Row) => string
  /**
   * Accessible name formatter for a per-row selection checkbox. Receives the row and returns its
   * label. When omitted, falls back to `labels.selectRow` formatted with `getRowId(row)`.
   */
  readonly getRowAriaLabel?: (row: Row) => string
  /** When true, render a select-all header checkbox and per-row checkboxes. */
  readonly selectable?: boolean
  /** Controlled sort state; when defined the table never owns it. */
  readonly sort?: DataTableSort | null
  /** Initial sort while uncontrolled. Defaults to `null` (unsorted). */
  readonly defaultSort?: DataTableSort | null
  /** Called with the requested next sort (or `null` when the cycle clears it). */
  readonly onSortChange?: (sort: DataTableSort | null) => void
  /** Controlled selection; when defined the table never owns the set. */
  readonly selectedKeys?: ReadonlySet<string>
  /** Initial selection while uncontrolled. Defaults to empty. */
  readonly defaultSelectedKeys?: ReadonlySet<string>
  /** Called with the requested next selection. */
  readonly onSelectionChange?: (keys: ReadonlySet<string>) => void
  /** When true, render skeleton rows instead of data and mark the table busy. */
  readonly loading?: boolean
  /** Number of skeleton rows to render while `loading`. Defaults to 3. */
  readonly loadingRowCount?: number
  /** Overrides for any subset of the user-facing strings. */
  readonly labels?: Partial<DataTableLabels>
  /** Injected icon slots for sortable headers. */
  readonly icons?: DataTableIcons
  /** Optional table caption content. */
  readonly caption?: ReactNode
  /** Extra classes merged onto the underlying `<table>`. */
  readonly className?: string
  /** Ref to the underlying `<table>` element. */
  readonly ref?: Ref<HTMLTableElement>
}

/** English defaults for every {@link DataTableLabels} field. */
export const defaultDataTableLabels: DataTableLabels = {
  selectAllRows: "Select all visible rows",
  selectRow: (rowId: string) => `Select row ${rowId}`,
  sortAscending: "Sorted ascending",
  sortDescending: "Sorted descending",
  emptyTitle: "No results",
  emptyDescription: "There is nothing to display yet.",
  loading: "Loading",
}
