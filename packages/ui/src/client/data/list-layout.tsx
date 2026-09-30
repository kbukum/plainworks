"use client"

import { Badge } from "@plainworks/elements/badge"
import { Button } from "@plainworks/elements/button"
import type { ReactElement, ReactNode } from "react"
import { Drawer } from "../overlays/drawer"

/** Every user-facing string of the {@link ListLayout}. */
export interface ListLayoutLabels {
  /** Names the filters, as the aside and the drawer title. */
  readonly filters: string
  /** The drawer button's visible text. */
  readonly filtersButton: string
  /** Names the drawer button while filters are applied. */
  readonly activeFilters: (count: number) => string
}

/** English defaults for every {@link ListLayoutLabels} field. */
export const defaultListLayoutLabels: ListLayoutLabels = {
  filters: "Filters",
  filtersButton: "Filters",
  activeFilters: (count) => `Filters, ${count} active`,
}

/** Props for {@link ListLayout}. */
export interface ListLayoutProps {
  readonly labels?: Partial<ListLayoutLabels>
  /** Free-text search, always shown above the results. */
  readonly search: ReactNode
  /** Facet and range controls. */
  readonly filters: ReactNode
  /** How many filters are applied, shown on the drawer button. */
  readonly activeFilters: number
  /** A decorative icon for the drawer button. */
  readonly filtersIcon?: ReactNode
  /** The results: a table, a card grid, or anything else. */
  readonly children: ReactNode
}

/**
 * A container-responsive list frame. Search sits above the results at every width. The filters
 * sit in an aside beside the results when the list is wide, and behind a "Filters" drawer
 * button when it is narrow, so a phone sees results first. The drawer mounts its copy of the
 * filters only while open.
 */
export function ListLayout({
  labels,
  search,
  filters,
  activeFilters,
  filtersIcon,
  children,
}: ListLayoutProps): ReactElement {
  const copy = { ...defaultListLayoutLabels, ...labels }
  return (
    <div className="@container/list">
      <div className="grid gap-5 @4xl/list:grid-cols-[16rem_minmax(0,1fr)] @4xl/list:items-start">
        <aside
          aria-label={copy.filters}
          className="hidden content-start gap-5 rounded-xl border bg-card p-4 @4xl/list:grid"
        >
          {filters}
        </aside>
        <div className="grid min-w-0 gap-4">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">{search}</div>
            <div className="@4xl/list:hidden">
              <Drawer
                side="left"
                title={copy.filters}
                trigger={
                  <Button
                    variant="outline"
                    aria-label={
                      activeFilters > 0 ? copy.activeFilters(activeFilters) : copy.filtersButton
                    }
                  >
                    {filtersIcon}
                    {copy.filtersButton}
                    {activeFilters > 0 ? (
                      <Badge aria-hidden variant="secondary" className="tabular-nums">
                        {activeFilters}
                      </Badge>
                    ) : null}
                  </Button>
                }
              >
                <div className="grid content-start gap-5">{filters}</div>
              </Drawer>
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
