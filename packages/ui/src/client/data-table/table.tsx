"use client"

import { Button } from "@plainworks/elements/button"
import { Checkbox } from "@plainworks/elements/checkbox"
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
import { Fragment, type ReactElement, useEffect, useId, useRef, useState } from "react"
import { useControllableState, useSelection } from "../../hooks"
import { EmptyState } from "../feedback/empty-state"
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

// Where each part of the table shows. The table is a container-query root, so these key off the
// table's own width, not the viewport:
//
//   wide  (≥ @2xl)  every column              · no disclosure
//   narrow (< @2xl) high-priority columns     · a per-row "Details" disclosure listing the rest
const LOW_PRIORITY_CLASS = "@max-2xl:hidden"
const NARROW_ONLY_CLASS = "@2xl:hidden"
// `overflow-wrap: anywhere`, not `break-word`: only `anywhere` lowers a cell's min-content width,
// so one long unbroken value (an email, a URL) cannot force the table wider than its container.
const WRAPPING_CELL_CLASS = "whitespace-normal wrap-anywhere"

/**
 * A compound, controlled-first data table. It owns only ephemeral view state — sort direction, row
 * selection, and which narrow rows show their details — and never reorders `rows`, so remote/paged
 * data stays a prop. In a narrow container, low-priority columns collapse into a per-row detail
 * disclosure rather than disappearing. Copy is injected through `labels`, icons through `icons`;
 * with neither provided it remains fully operable and accessible via its defaults and `aria-sort`.
 */
export function DataTable<Row>(props: DataTableProps<Row>): ReactElement {
  const {
    columns,
    rows,
    getRowId,
    getRowLabel,
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
    showCaption = false,
    empty,
    className,
    ref,
  } = props
  const baseId = useId()

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

  const expanded = useSelection<string>({ mode: "multiple" })
  const hasDetails = columns.some((column) => column.priority === "low")

  const rowIds = rows.map(getRowId)

  // Open row details belong to the rows on screen. When the rows change (a new page, a filter),
  // forget details for rows that left, so paging back never reopens one and the set stays bounded.
  const rowIdsKey = JSON.stringify(rowIds)
  const [expandedRowsKey, setExpandedRowsKey] = useState(rowIdsKey)
  if (expandedRowsKey !== rowIdsKey) {
    setExpandedRowsKey(rowIdsKey)
    const present = new Set(rowIds)
    if ([...expanded.selected].some((id) => !present.has(id))) {
      expanded.setSelected(new Set([...expanded.selected].filter((id) => present.has(id))))
    }
  }
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

  // Skip cell projection entirely while loading: the body renders skeletons and discards these
  // models, so running each column's `cell(row)` would do expensive work for nothing.
  const rowModels: readonly DataTableRowModel[] = loading
    ? []
    : rows.map((row, index) => {
        const id = getRowId(row)
        const rowLabel = getRowLabel === undefined ? labels.row(id) : getRowLabel(row)
        return {
          id,
          detailId: `${baseId}details-${index}`,
          cells: columns.map((column) => ({
            columnId: column.id,
            header: column.header,
            align: column.align ?? "start",
            content: column.cell(row),
            priority: column.priority,
            nowrap: column.nowrap ?? false,
          })),
          selectAriaLabel: labels.selectRow(rowLabel),
          detailsAriaLabel: labels.rowDetails(rowLabel),
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
    hasDetails,
    isRowExpanded: expanded.isSelected,
    toggleRowDetails: expanded.toggle,
    collapseRowDetails: expanded.clear,
    empty: empty ?? <EmptyState title={labels.emptyTitle} description={labels.emptyDescription} />,
    loading,
    loadingRowCount: normalizedLoadingRowCount,
    columnSpan: columns.length + (selectable ? 1 : 0) + (hasDetails ? 1 : 0),
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
          {caption === undefined ? null : (
            <TableCaption className={showCaption ? undefined : "sr-only"}>{caption}</TableCaption>
          )}
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
  const {
    columns,
    selectable,
    hasDetails,
    collapseRowDetails,
    labels,
    allSelected,
    someSelected,
    toggleAll,
  } = useDataTableContext()
  const detailsHeadRef = useRef<HTMLTableCellElement>(null)

  // An open row detail holds its low-priority values (they mount in one place only). The details
  // column hides once the container is wide, so close every detail then and the values return to
  // their own columns. CSS stays the one source of the breakpoint; this only follows it.
  useEffect(() => {
    const head = detailsHeadRef.current
    if (head === null || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => {
      if (head.getClientRects().length === 0) collapseRowDetails()
    })
    observer.observe(head)
    return () => observer.disconnect()
  }, [collapseRowDetails])

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
      {hasDetails ? (
        <TableHead ref={detailsHeadRef} className={cn("w-0 px-1", NARROW_ONLY_CLASS)}>
          <span className="sr-only">{labels.details}</span>
        </TableHead>
      ) : null}
    </TableRow>
  )
}

function DataTableHeaderCell({ column }: { readonly column: DataTableHeaderModel }): ReactElement {
  const { requestSort, icons, labels } = useDataTableContext()
  const alignClass = ALIGN_CLASS[column.align]
  const priorityClass = column.priority === "low" ? LOW_PRIORITY_CLASS : undefined

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
  const { loading, loadingRowCount, columns, rows, columnSpan, selectable, hasDetails, empty } =
    useDataTableContext()

  if (loading) {
    return (
      <>
        {Array.from({ length: loadingRowCount }, (_, index) => (
          <TableRow key={index} aria-hidden="true">
            {selectable ? (
              <TableCell className="whitespace-normal">
                <Skeleton className="size-4" />
              </TableCell>
            ) : null}
            {columns.map((column) => (
              <TableCell
                key={column.id}
                className={cn("whitespace-normal", column.priority === "low" && LOW_PRIORITY_CLASS)}
              >
                <Skeleton className="h-4 w-full" />
              </TableCell>
            ))}
            {hasDetails ? <TableCell className={cn("px-1", NARROW_ONLY_CLASS)} /> : null}
          </TableRow>
        ))}
      </>
    )
  }

  if (rows.length === 0) {
    return (
      <TableRow>
        <TableCell colSpan={columnSpan} className="whitespace-normal">
          {empty}
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
  const {
    selectable,
    hasDetails,
    columnSpan,
    isRowSelected,
    toggleRow,
    isRowExpanded,
    toggleRowDetails,
  } = useDataTableContext()
  const selected = isRowSelected(row.id)
  const expanded = hasDetails && isRowExpanded(row.id)
  const detailCells = row.cells.filter((cell) => cell.priority === "low")
  return (
    <Fragment>
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
              cell.nowrap ? "whitespace-nowrap" : WRAPPING_CELL_CLASS,
              cell.priority === "low" && LOW_PRIORITY_CLASS,
            )}
          >
            {/* While the row detail is open it shows this value, so it never mounts twice. */}
            {expanded && cell.priority === "low" ? null : cell.content}
          </TableCell>
        ))}
        {hasDetails ? (
          <TableCell className={cn("px-1 text-end", NARROW_ONLY_CLASS)}>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={row.detailsAriaLabel}
              aria-expanded={expanded}
              aria-controls={expanded ? row.detailId : undefined}
              onClick={() => toggleRowDetails(row.id)}
            >
              <span
                aria-hidden="true"
                className={cn("transition-transform duration-fast", expanded && "rotate-90")}
              >
                ›
              </span>
            </Button>
          </TableCell>
        ) : null}
      </TableRow>
      {expanded ? (
        <TableRow id={row.detailId} data-slot="data-table-detail" className={NARROW_ONLY_CLASS}>
          <TableCell colSpan={columnSpan} className="whitespace-normal">
            <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1">
              {detailCells.map((cell) => (
                <Fragment key={cell.columnId}>
                  <dt className="font-medium text-muted-foreground">{cell.header}</dt>
                  <dd className="min-w-0 wrap-break-word">{cell.content}</dd>
                </Fragment>
              ))}
            </dl>
          </TableCell>
        </TableRow>
      ) : null}
    </Fragment>
  )
}
