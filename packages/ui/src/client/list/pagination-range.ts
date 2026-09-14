/** A rendered pagination slot: a concrete page number, or an ellipsis standing in for a gap. */
export type PaginationSlot = number | "ellipsis"

// Inclusive integer range [start, end].
function range(start: number, end: number): number[] {
  const length = end - start + 1
  return Array.from({ length: Math.max(0, length) }, (_, index) => start + index)
}

// Coerce an untrusted numeric prop to a finite integer no smaller than `min`, so a `NaN`,
// fractional, or infinite input can never leak into a rendered page number.
function toInt(value: number, min: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.trunc(value))
}

/**
 * Derive the sequence of page slots to render for an offset pager: always the first and last page,
 * the pages within `siblingCount` of the current page, and an `"ellipsis"` marker for each
 * collapsed gap. Inputs are normalized to finite integers (`pageCount` ≥ 1, `siblingCount` ≥ 0),
 * `page` is clamped into `[1, pageCount]`, and small page counts render every page with no
 * ellipsis. Pure and deterministic so it is unit-tested without a DOM.
 */
export function getPaginationRange(
  page: number,
  pageCount: number,
  siblingCount = 1,
): readonly PaginationSlot[] {
  const totalPages = toInt(pageCount, 1)
  const siblings = toInt(siblingCount, 0)
  if (totalPages <= 1) return [1]
  const current = Math.min(Math.max(toInt(page, 1), 1), totalPages)

  // First, last, current, and the two ellipsis placeholders bound how many numbers fit before a
  // gap is worth collapsing; below that, every page is shown.
  const totalSlots = siblings * 2 + 5
  if (totalSlots >= totalPages) return range(1, totalPages)

  const leftSibling = Math.max(current - siblings, 1)
  const rightSibling = Math.min(current + siblings, totalPages)
  const showLeftEllipsis = leftSibling > 2
  const showRightEllipsis = rightSibling < totalPages - 1
  const edgeCount = 3 + siblings * 2

  if (!showLeftEllipsis && showRightEllipsis) {
    return [...range(1, edgeCount), "ellipsis", totalPages]
  }
  if (showLeftEllipsis && !showRightEllipsis) {
    return [1, "ellipsis", ...range(totalPages - edgeCount + 1, totalPages)]
  }
  return [1, "ellipsis", ...range(leftSibling, rightSibling), "ellipsis", totalPages]
}
