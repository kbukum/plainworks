"use client"

import { cn } from "@plainworks/theme"
import { type ReactElement, type ReactNode, useLayoutEffect, useRef, useState } from "react"

/** One compared item: a column of a {@link ComparisonGrid}. */
export interface ComparisonGridColumn {
  readonly id: string
  /** A plain name, used as the cell's label when the grid stacks on a narrow viewport. */
  readonly label: string
  /** The column header. Defaults to `label`. */
  readonly header?: ReactNode
}

/** One case or attribute: a row of a {@link ComparisonGrid}. */
export interface ComparisonGridRow {
  readonly id: string
  /** The row header. */
  readonly header: ReactNode
}

/** Props for {@link ComparisonGrid}. */
export interface ComparisonGridProps {
  /** The grid's accessible name, also the name of its scroll region. */
  readonly label: string
  /** The corner header above the row headers. */
  readonly corner?: ReactNode
  readonly columns: readonly ComparisonGridColumn[]
  readonly rows: readonly ComparisonGridRow[]
  /** Renders the cell where a row and a column meet. */
  readonly cell: (row: ComparisonGridRow, column: ComparisonGridColumn) => ReactNode
  /** Classes for the scroll region, such as a maximum height. */
  readonly className?: string | undefined
}

/**
 * Items side by side: one column per item and one row per case or attribute. Column and row
 * headers stay in view while the grid scrolls, and the region's scroll padding follows their size,
 * so a focused cell is never hidden behind them (WCAG 2.4.11). Below the `md` breakpoint the
 * column headers become a stack of item cards, keeping any status or controls they hold visible,
 * and each row becomes a card listing every item's cell under a visible label, so the content
 * stays clear even where a browser drops table semantics for the changed display.
 */
export function ComparisonGrid({
  label,
  corner,
  columns,
  rows,
  cell,
  className,
}: ComparisonGridProps): ReactElement {
  const head = useRef<HTMLTableSectionElement>(null)
  const side = useRef<HTMLTableCellElement>(null)
  const [padding, setPadding] = useState({ top: 0, start: 0 })

  useLayoutEffect(() => {
    // Only a header that sticks can cover a focused cell; stacked, the headers scroll away.
    const sticky = (el: HTMLElement | null): el is HTMLElement =>
      el !== null && getComputedStyle(el).position === "sticky"
    const measure = () => {
      const top = sticky(head.current) ? head.current.getBoundingClientRect().height : 0
      const start = sticky(side.current) ? side.current.getBoundingClientRect().width : 0
      setPadding((p) => (p.top === top && p.start === start ? p : { top, start }))
    }
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    for (const el of [head.current, side.current]) if (el !== null) observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    // The region scrolls in both directions, so it takes focus for keyboard scrolling (WCAG 2.1.1).
    <section
      aria-label={label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable.
      tabIndex={0}
      data-slot="comparison-grid"
      className={cn(
        "relative overflow-auto rounded-lg md:border focus-visible:outline-2 focus-visible:outline-ring",
        className,
      )}
      style={{ scrollPaddingTop: padding.top, scrollPaddingInlineStart: padding.start }}
    >
      <table className="w-full border-separate border-spacing-0 text-sm max-md:block">
        <caption className="sr-only">{label}</caption>
        <thead ref={head} className="max-md:mb-3 max-md:block md:sticky md:top-0 md:z-20">
          <tr className="max-md:flex max-md:flex-col max-md:gap-3">
            <th
              ref={side}
              scope="col"
              className="border-b bg-background p-3 text-start font-medium text-muted-foreground max-md:hidden md:sticky md:start-0 md:z-10"
            >
              {corner}
            </th>
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className="bg-background p-3 text-start align-top font-medium max-md:block max-md:rounded-lg max-md:border md:min-w-64 md:border-s md:border-b"
              >
                {column.header ?? column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="max-md:flex max-md:flex-col max-md:gap-3">
          {rows.map((row) => (
            <tr
              key={row.id}
              className="max-md:flex max-md:flex-col max-md:overflow-hidden max-md:rounded-lg max-md:border"
            >
              <th
                scope="row"
                className="bg-background p-3 text-start align-top font-medium max-md:border-b max-md:bg-muted/40 md:sticky md:start-0 md:z-10 md:border-b md:in-[tr:last-child]:border-b-0"
              >
                {row.header}
              </th>
              {columns.map((column) => (
                <td
                  key={column.id}
                  className="min-w-0 p-3 align-top max-md:border-t max-md:first-of-type:border-t-0 md:border-s md:border-b md:in-[tr:last-child]:border-b-0"
                >
                  {/* Stacked, the item cards are away from the cells, so this names the cell then. */}
                  <div className="mb-1 text-xs font-medium text-muted-foreground md:hidden">
                    {column.label}
                  </div>
                  {cell(row, column)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
