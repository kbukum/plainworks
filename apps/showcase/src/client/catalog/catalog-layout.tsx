"use client"

import { Badge } from "@plainworks/elements/badge"
import { Button } from "@plainworks/elements/button"
import { Drawer } from "@plainworks/ui/overlays/drawer"
import { SlidersHorizontal } from "lucide-react"
import type { ReactElement, ReactNode } from "react"

/** Props for the shared catalog filter-and-results layout. */
export interface CatalogLayoutProps {
  /** Accessible name for the filters, used for the aside and the drawer title. */
  readonly filtersLabel: string
  /** Free-text search, always shown above the results. */
  readonly search: ReactNode
  /** Facet and range controls. */
  readonly filters: ReactNode
  /** How many filters are applied, shown on the drawer button. */
  readonly activeFilters: number
  /** The catalog's table or card-grid surface. */
  readonly children: ReactNode
}

/**
 * A container-responsive catalog frame. Search sits above the results at every width. The filters
 * sit in an aside beside the results when the catalog is wide, and behind a "Filters" drawer
 * button when it is narrow, so a phone sees results first. The drawer mounts its copy of the
 * filters only while open.
 */
export function CatalogLayout({
  filtersLabel,
  search,
  filters,
  activeFilters,
  children,
}: CatalogLayoutProps): ReactElement {
  return (
    <div className="@container/catalog">
      <div className="grid gap-5 @4xl/catalog:grid-cols-[16rem_minmax(0,1fr)] @4xl/catalog:items-start">
        <aside
          aria-label={filtersLabel}
          className="hidden content-start gap-5 rounded-xl border bg-card p-4 @4xl/catalog:grid"
        >
          {filters}
        </aside>
        <div className="grid min-w-0 gap-4">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">{search}</div>
            <div className="@4xl/catalog:hidden">
              <Drawer
                side="left"
                title={filtersLabel}
                trigger={
                  <Button
                    variant="outline"
                    aria-label={activeFilters > 0 ? `Filters, ${activeFilters} active` : "Filters"}
                  >
                    <SlidersHorizontal aria-hidden />
                    Filters
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
