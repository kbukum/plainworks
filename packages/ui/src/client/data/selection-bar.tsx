"use client"

import { Button } from "@plainworks/elements/button"
import { cn } from "@plainworks/theme"
import { type ReactElement, type ReactNode, type RefObject, useLayoutEffect, useRef } from "react"
import { IconButton } from "../actions/icon-button"
import { ItemMarker } from "../display/item-marker"

/** One pick shown in a {@link SelectionBar}. */
export interface SelectionBarItem {
  readonly id: string
  /** The item's name, shown beside its marker and used to name its remove button. */
  readonly name: string
}

/** Every user-facing string of a {@link SelectionBar}. */
export interface SelectionBarLabels {
  /** Leads each remove button's name, followed by the item's name. */
  readonly remove: string
  readonly clear: string
}

/** English defaults for every {@link SelectionBarLabels} field. */
export const defaultSelectionBarLabels: SelectionBarLabels = {
  remove: "Remove",
  clear: "Clear",
}

/** Props for {@link SelectionBar}. */
export interface SelectionBarProps {
  /** The region's accessible name, such as "Models to compare". */
  readonly label: string
  /** The picks in slot order; each gets the marker for its place. */
  readonly items: readonly SelectionBarItem[]
  /** A short count, such as "3 of 8 models", shown and announced politely when it changes. */
  readonly summary: string
  readonly onRemove: (id: string) => void
  readonly onClear: () => void
  /** What to do with the picks, such as a primary "Compare" button. */
  readonly actions?: ReactNode
  readonly labels?: Partial<SelectionBarLabels>
  readonly className?: string
}

/**
 * The document-root custom property holding the space a shown {@link SelectionBar} covers at the
 * foot of the viewport. The package stylesheet turns it into the root's bottom `scroll-padding`.
 */
export const SELECTION_BAR_CLEARANCE = "--plainworks-selection-bar-clearance"

// Publishes the bar's height plus its sticky offset on the document root while it is shown, so
// focus and anchor scrolling stop above it instead of under it (WCAG 2.4.11).
function useClearance(bar: RefObject<HTMLElement | null>, shown: boolean): void {
  useLayoutEffect(() => {
    const node = bar.current
    if (!shown || node === null) return
    const root = node.ownerDocument.documentElement
    const measure = (): void => {
      const offset = Number.parseFloat(
        node.ownerDocument.defaultView?.getComputedStyle(node).bottom ?? "",
      )
      const clearance = node.offsetHeight + (Number.isFinite(offset) ? offset : 0)
      root.style.setProperty(SELECTION_BAR_CLEARANCE, `${clearance}px`)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => {
      observer.disconnect()
      root.style.removeProperty(SELECTION_BAR_CLEARANCE)
    }
  }, [bar, shown])
}

/**
 * A bar that stays at the bottom of the scroll area while items are picked: the summary, each pick
 * with its marker and a named remove button, the actions, and a clear button. It sits in the
 * normal flow (sticky, not fixed), so it never covers the last rows of the page, and it reserves
 * its own height in the root's `scroll-padding` (see {@link SELECTION_BAR_CLEARANCE}), so a
 * control focused above it is scrolled clear. It hides when nothing is picked, while the summary
 * is still announced. Show one bar per document; the root reservation is shared.
 */
export function SelectionBar({
  label,
  items,
  summary,
  onRemove,
  onClear,
  actions,
  labels,
  className,
}: SelectionBarProps): ReactElement {
  const copy = { ...defaultSelectionBarLabels, ...labels }
  const bar = useRef<HTMLElement>(null)
  useClearance(bar, items.length > 0)
  return (
    <>
      <p role="status" className="sr-only">
        {summary}
      </p>
      {items.length === 0 ? null : (
        <section
          ref={bar}
          aria-label={label}
          data-slot="selection-bar"
          className={cn(
            "sticky bottom-4 z-sticky mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg",
            className,
          )}
        >
          <span aria-hidden="true" className="px-1 text-caption font-semibold tabular-nums">
            {summary}
          </span>
          {/* A real basis makes the picks wrap onto their own row on narrow screens instead of
              shrinking under the actions. */}
          <ul className="flex min-w-0 flex-[1_1_16rem] flex-wrap items-center gap-1">
            {items.map((item, index) => (
              <li
                key={item.id}
                className="flex min-w-0 max-w-full items-center rounded-md bg-muted py-0.5 pr-0.5 pl-1.5"
              >
                <ItemMarker index={index} className="max-w-48 text-caption">
                  {item.name}
                </ItemMarker>
                <IconButton
                  label={`${copy.remove} ${item.name}`}
                  icon="×"
                  size="icon-xs"
                  onClick={() => onRemove(item.id)}
                />
              </li>
            ))}
          </ul>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClear}>
              {copy.clear}
            </Button>
            {actions}
          </div>
        </section>
      )}
    </>
  )
}
