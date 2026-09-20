"use client"

import { Button } from "@plainworks/elements/button"
import { Checkbox } from "@plainworks/elements/checkbox"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@plainworks/elements/empty"
import { Skeleton } from "@plainworks/elements/skeleton"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@plainworks/elements/table"
import { cn } from "@plainworks/theme"
import type { ReactElement } from "react"
import { useControllableState, useSelection } from "../../hooks"
import {
  type ColumnAlign,
  type DataTableProps,
  type DataTableSort,
  defaultDataTableLabels,
} from "./columns"
import {
  DataTableContext,
  type DataTableContextValue,
  type DataTableHeaderModel,
  type DataTableRowModel,
  useDataTableContext,
} from "./context"

const ALIGN_CLASS: Record<ColumnAlign, string> = {
  start: "text-start",
  center: "text-center",
  end: "text-end",
}

const SORTABLE_ALIGN_CLASS: Record<ColumnAlign, string> = {
  start: "justify-between",
  center: "justify-center gap-2",
  end: "justify-end gap-2",
}

// Advance the sort for `columnId` through the asc → desc → unset cycle. A different column starts a
// fresh ascending sort; the active column steps to descending, then clears.
function nextSort(current: DataTableSort | null, columnId: string): DataTableSort | null {
  if (current === null || current.columnId !== columnId) {
    return { columnId, direction: "asc" }
  }
  if (current.direction === "asc") {
    return { columnId, direction: "desc" }
  }
  return null
}

/**
 * A compound, controlled-first data table. It owns only ephemeral view state — sort direction and
 * row selection through the neutral stately hooks — and never reorders `rows`, so remote/paged data
 * stays a prop. Copy is injected through `labels`, icons through `icons`; with neither provided it
 * remains fully operable and accessible via its defaults and `aria-sort`.
 */
export function DataTable<Row>(props: DataTableProps<Row>): ReactElement {
  const {
    columns,
    rows,
    getRowId,
    getRowAriaLabel,
    selectable = false,
    sort,
    defaultSort = null,
    onSortChange,
    selectedKeys,
    defaultSelectedKeys,
    onSelectionChange,
    loading = false,
    loadingRowCount = 3,
    labels: labelOverrides,
    icons = {},
    caption,
    className,
    ref,
  } = props

  const labels = { ...defaultDataTableLabels, ...labelOverrides }

  const [activeSort, setSort] = useControllableState<DataTableSort | null>({
    value: sort,
    defaultValue: defaultSort,
    onChange: onSortChange,
  })

  const selection = useSelection<string>({
    mode: "multiple",
    value: selectedKeys,
    defaultValue: defaultSelectedKeys,
    onChange: onSelectionChange,
  })

  const rowIds = rows.map(getRowId)
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selection.isSelected(id))
  const someSelected = rowIds.some((id) => selection.isSelected(id))

  const toggleAll = (): void => {
    const next = new Set(selection.selected)
    if (allSelected) {
      for (const id of rowIds) next.delete(id)
    } else {
      for (const id of rowIds) next.add(id)
    }
    selection.setSelected(next)
  }

  const headerModels: readonly DataTableHeaderModel[] = columns.map((column) => ({
    id: column.id,
    header: column.header,
    sortable: column.sortable ?? false,
    align: column.align ?? "start",
    priority: column.priority,
    ariaSort:
      activeSort?.columnId === column.id
        ? activeSort.direction === "asc"
          ? "ascending"
          : "descending"
        : undefined,
  }))

  const rowSelectLabel = (row: Row, id: string): string => {
    if (getRowAriaLabel !== undefined) return getRowAriaLabel(row)
    if (typeof labels.selectRow === "function") return labels.selectRow(id)
    return `${labels.selectRow} ${id}`
  }

  // Skip cell projection entirely while loading: the body renders skeletons and discards these
  // models, so running each column's `cell(row)` would do expensive work for nothing.
  const rowModels: readonly DataTableRowModel[] = loading
    ? []
    : rows.map((row) => {
        const id = getRowId(row)
        return {
          id,
          cells: columns.map((column) => ({
            columnId: column.id,
            align: column.align ?? "start",
            content: column.cell(row),
            priority: column.priority,
          })),
          selectAriaLabel: rowSelectLabel(row, id),
        }
      })

  const normalizedLoadingRowCount = Number.isFinite(loadingRowCount)
    ? Math.max(0, Math.floor(loadingRowCount))
    : 3

  const context: DataTableContextValue = {
    columns: headerModels,
    rows: rowModels,
    labels,
    icons,
    selectable,
    loading,
    loadingRowCount: normalizedLoadingRowCount,
    columnSpan: columns.length + (selectable ? 1 : 0),
    isRowSelected: selection.isSelected,
    toggleRow: selection.toggle,
    allSelected,
    someSelected,
    toggleAll,
    requestSort: (columnId: string) => setSort((current) => nextSort(current, columnId)),
  }

  return (
    <DataTableContext value={context}>
      <div data-slot="data-table-container" className="@container w-full">
        {loading ? (
          <div role="status" className="sr-only">
            {labels.loading}
          </div>
        ) : null}
        <Table ref={ref} className={className} aria-busy={loading || undefined}>
          {caption === undefined ? null : <TableCaption>{caption}</TableCaption>}
          <TableHeader>
            <DataTableHeaderRow />
          </TableHeader>
          <TableBody>
            <DataTableBody />
          </TableBody>
        </Table>
      </div>
    </DataTableContext>
  )
}

function DataTableHeaderRow(): ReactElement {
  const { columns, selectable, labels, allSelected, someSelected, toggleAll } =
    useDataTableContext()
  return (
    <TableRow>
      {selectable ? (
        <TableHead className="w-0 whitespace-normal">
          <Checkbox
            aria-label={labels.selectAllRows}
            checked={allSelected}
            indeterminate={someSelected && !allSelected}
            onCheckedChange={() => toggleAll()}
          />
        </TableHead>
      ) : null}
      {columns.map((column) => (
        <DataTableHeaderCell key={column.id} column={column} />
      ))}
    </TableRow>
  )
}

function DataTableHeaderCell({ column }: { readonly column: DataTableHeaderModel }): ReactElement {
  const { requestSort, icons, labels } = useDataTableContext()
  const alignClass = ALIGN_CLASS[column.align]
  const priorityClass = column.priority === "low" ? "@max-2xl:hidden" : undefined

  if (!column.sortable) {
    return (
      <TableHead className={cn("whitespace-normal", alignClass, priorityClass)}>
        {column.header}
      </TableHead>
    )
  }

  const icon =
    column.ariaSort === "ascending"
      ? icons.sortAscending
      : column.ariaSort === "descending"
        ? icons.sortDescending
        : icons.sortable
  const stateLabel =
    column.ariaSort === "ascending"
      ? labels.sortAscending
      : column.ariaSort === "descending"
        ? labels.sortDescending
        : null

  return (
    <TableHead
      aria-sort={column.ariaSort}
      className={cn("p-0 whitespace-normal", alignClass, priorityClass)}
    >
      <Button
        variant="ghost"
        size="sm"
        className={cn("h-10 w-full rounded-none font-medium", SORTABLE_ALIGN_CLASS[column.align])}
        onClick={() => requestSort(column.id)}
      >
        <span>{column.header}</span>
        {icon === undefined ? null : <span aria-hidden="true">{icon}</span>}
        {stateLabel === null ? null : <span className="sr-only">{stateLabel}</span>}
      </Button>
    </TableHead>
  )
}

function DataTableBody(): ReactElement {
  const { loading, loadingRowCount, columns, rows, columnSpan, selectable, labels } =
    useDataTableContext()

  if (loading) {
    return (
      <>
        {Array.from({ length: loadingRowCount }, (_, index) => (
          <TableRow key={index} aria-hidden="true">
            {selectable ? (
              <TableCell className="whitespace-normal">
                <Skeleton className="size-4 motion-reduce:animate-none" />
              </TableCell>
            ) : null}
            {columns.map((column) => (
              <TableCell
                key={column.id}
                className={cn("whitespace-normal", column.priority === "low" && "@max-2xl:hidden")}
              >
                <Skeleton className="h-4 w-full motion-reduce:animate-none" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </>
    )
  }

  if (rows.length === 0) {
    return (
      <TableRow>
        <TableCell colSpan={columnSpan}>
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{labels.emptyTitle}</EmptyTitle>
              <EmptyDescription>{labels.emptyDescription}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </TableCell>
      </TableRow>
    )
  }

  // Render each row model. Callers page or slice `rows` to bound rendered DOM nodes; the table
  // stays lean and does not bundle a windowing dependency.
  return (
    <>
      {rows.map((row) => (
        <DataTableRow key={row.id} row={row} />
      ))}
    </>
  )
}

function DataTableRow({ row }: { readonly row: DataTableRowModel }): ReactElement {
  const { selectable, isRowSelected, toggleRow } = useDataTableContext()
  const selected = isRowSelected(row.id)
  return (
    <TableRow data-state={selected ? "selected" : undefined}>
      {selectable ? (
        <TableCell className="whitespace-normal">
          <Checkbox
            aria-label={row.selectAriaLabel}
            checked={selected}
            onCheckedChange={() => toggleRow(row.id)}
          />
        </TableCell>
      ) : null}
      {row.cells.map((cell) => (
        <TableCell
          key={cell.columnId}
          className={cn(
            ALIGN_CLASS[cell.align],
            "whitespace-normal break-words",
            cell.priority === "low" && "@max-2xl:hidden",
          )}
        >
          {cell.content}
        </TableCell>
      ))}
    </TableRow>
  )
}
