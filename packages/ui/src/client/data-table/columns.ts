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
   * How essential the column is when the table's container is narrow. A `low` column leaves the row
   * below the wide-table threshold and moves into that row's detail disclosure, so its value stays
   * one tap away instead of disappearing. Defaults to `high` (always a column).
   */
  readonly priority?: "high" | "low" | undefined
  /** Keep short values (IDs, codes, dates) on one line instead of wrapping mid-value. */
  readonly nowrap?: boolean | undefined
}

/**
 * Every user-facing string, injected so the table ships no hardcoded copy. All fields have English
 * defaults ({@link defaultDataTableLabels}); a caller overrides any subset through the `labels`
 * prop.
 */
export interface DataTableLabels {
  /** Accessible name for the header select-all checkbox. */
  readonly selectAllRows: string
  /** Names a row when no `getRowLabel` is given, from its id. */
  readonly row: (rowId: string) => string
  /** Accessible name for a per-row selection checkbox, from the row's label. */
  readonly selectRow: (rowLabel: string) => string
  /** Screen-reader-only header of the row-detail disclosure column. */
  readonly details: string
  /** Accessible name for a row's detail disclosure button, from the row's label. */
  readonly rowDetails: (rowLabel: string) => string
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
   * A short human name for a row (a title, a person's name), used to label its selection checkbox
   * and detail disclosure. Defaults to `labels.row(getRowId(row))`.
   */
  readonly getRowLabel?: (row: Row) => string
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
  /**
   * The table's accessible name. It is visually hidden by default because the surrounding section
   * heading already titles the data; set `showCaption` to render it on screen.
   */
  readonly caption?: ReactNode
  /** Render the caption visibly below the table. Defaults to false. */
  readonly showCaption?: boolean
  /**
   * The view for zero rows, e.g. an `EmptyState` with a next action. Defaults to an `EmptyState`
   * built from the empty labels.
   */
  readonly empty?: ReactNode
  /** Extra classes merged onto the underlying `<table>`. */
  readonly className?: string
  /** Ref to the underlying `<table>` element. */
  readonly ref?: Ref<HTMLTableElement>
}

/** English defaults for every {@link DataTableLabels} field. */
export const defaultDataTableLabels: DataTableLabels = {
  selectAllRows: "Select all visible rows",
  row: (rowId: string) => `row ${rowId}`,
  selectRow: (rowLabel: string) => `Select ${rowLabel}`,
  details: "Details",
  rowDetails: (rowLabel: string) => `Details for ${rowLabel}`,
  sortAscending: "Sorted ascending",
  sortDescending: "Sorted descending",
  emptyTitle: "No results",
  emptyDescription: "There is nothing to display yet.",
  loading: "Loading",
}
