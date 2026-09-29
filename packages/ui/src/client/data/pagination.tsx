"use client"

import { Button } from "@plainworks/elements/button"
import {
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  Pagination as PaginationNav,
} from "@plainworks/elements/pagination"
import { cn } from "@plainworks/theme"
import type { ReactElement, ReactNode } from "react"
import { getPaginationRange } from "./pagination-range"

/**
 * Every user-facing string, injected so the pager ships no hardcoded copy. All fields have English
 * defaults ({@link defaultPaginationLabels}); a caller overrides any subset through `labels`.
 */
export interface PaginationLabels {
  /** Accessible name for the `<nav>` landmark. */
  readonly navLabel: string
  /** Accessible name for the previous-page button. */
  readonly previous: string
  /** Accessible name for the next-page button. */
  readonly next: string
  /** Accessible name for a page button, taking the 1-based page number. */
  readonly page: (page: number) => string
  /** Screen-reader-only suffix marking the current page. */
  readonly currentPage: string
}

/** English defaults for every {@link PaginationLabels} field. */
export const defaultPaginationLabels: PaginationLabels = {
  navLabel: "Pagination",
  previous: "Go to previous page",
  next: "Go to next page",
  page: (page: number) => `Go to page ${page}`,
  currentPage: "current page",
}

/** Props for {@link Pagination}. Controlled: `page` is owned by the caller and echoed by `onPageChange`. */
export interface PaginationProps {
  /** The active 1-based page. */
  readonly page: number
  /** Rows per page — combined with `total` to derive the page count (the `std/list` offset shape). */
  readonly pageSize: number
  /** Total number of rows across all pages. */
  readonly total: number
  /** Called with the requested 1-based page; never fired for the active page or an out-of-range page. */
  readonly onPageChange: (page: number) => void
  /** Pages to show on each side of the active page before collapsing to an ellipsis. Defaults to 1. */
  readonly siblingCount?: number
  /** Optional leading/trailing content (e.g. a page-size selector or a result count). */
  readonly children?: ReactNode
  /** Overrides for any subset of the user-facing strings. */
  readonly labels?: Partial<PaginationLabels>
  readonly className?: string
}

/**
 * A controlled offset pager over the `std/list` page/pageSize/total shape. It derives the page
 * count and the windowed slot sequence (first/last, siblings, collapsed ellipses), disables the
 * ends at the bounds, and marks the active page with `aria-current`. Numeric props are normalized
 * to finite integers, so a `NaN`/fractional/infinite input never renders a bogus page. It owns no
 * page state — `page` is a prop and every navigation reports the requested page through
 * `onPageChange` — so it stays in step with a `std/list` query the caller holds. The control row
 * wraps rather than overflowing, so it reflows in a narrow container and at high zoom.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  siblingCount = 1,
  children,
  labels: labelOverrides,
  className,
}: PaginationProps): ReactElement {
  const labels = { ...defaultPaginationLabels, ...labelOverrides }
  const safePageSize = Math.max(1, toFiniteInt(pageSize, 1))
  const safeTotal = Math.max(0, toFiniteInt(total, 0))
  const pageCount = Math.max(1, Math.ceil(safeTotal / safePageSize))
  const current = Math.min(Math.max(toFiniteInt(page, 1), 1), pageCount)
  const slots = getPaginationRange(current, pageCount, siblingCount)

  const goTo = (next: number): void => {
    if (next >= 1 && next <= pageCount && next !== current) onPageChange(next)
  }

  return (
    <PaginationNav
      aria-label={labels.navLabel}
      className={cn("flex-wrap items-center gap-2", className)}
    >
      {children}
      <PaginationContent className="flex-wrap justify-center">
        <PaginationItem>
          <Button
            variant="ghost"
            size="sm"
            aria-label={labels.previous}
            disabled={current <= 1}
            onClick={() => goTo(current - 1)}
          >
            <span aria-hidden="true">‹</span>
          </Button>
        </PaginationItem>
        {slots.map((slot, index) =>
          slot === "ellipsis" ? (
            <PaginationItem key={`ellipsis-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={slot}>
              <Button
                variant={slot === current ? "outline" : "ghost"}
                size="sm"
                aria-current={slot === current ? "page" : undefined}
                aria-label={
                  slot === current
                    ? `${labels.page(slot)}, ${labels.currentPage}`
                    : labels.page(slot)
                }
                className={cn("min-w-9", slot === current && "pointer-events-none")}
                onClick={() => goTo(slot)}
              >
                {slot}
              </Button>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          <Button
            variant="ghost"
            size="sm"
            aria-label={labels.next}
            disabled={current >= pageCount}
            onClick={() => goTo(current + 1)}
          >
            <span aria-hidden="true">›</span>
          </Button>
        </PaginationItem>
      </PaginationContent>
    </PaginationNav>
  )
}

// Coerce an untrusted numeric prop to a finite integer, falling back when it is `NaN`, fractional,
// or infinite, so a bad input can never propagate into a page count or a rendered label.
function toFiniteInt(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : fallback
}
