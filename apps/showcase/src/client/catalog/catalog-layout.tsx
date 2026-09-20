"use client"

import type { ReactElement, ReactNode } from "react"

/** Props for the shared catalog filter-and-results layout. */
export interface CatalogLayoutProps {
  /** Accessible name for the filter rail. */
  readonly filtersLabel: string
  /** Search, facet, and range controls. */
  readonly filters: ReactNode
  /** The catalog's table or card-grid surface. */
  readonly children: ReactNode
}

/**
 * A container-responsive catalog frame. Filters stay in a contained surface and move beside the
 * results only when the catalog itself has enough room for both columns.
 */
export function CatalogLayout({
  filtersLabel,
  filters,
  children,
}: CatalogLayoutProps): ReactElement {
  return (
    <div className="@container/catalog">
      <div className="grid gap-5 @5xl/catalog:grid-cols-[18rem_minmax(0,1fr)] @5xl/catalog:items-start">
        <aside
          aria-label={filtersLabel}
          className="grid content-start gap-5 rounded-xl border border-border/70 bg-card p-4 shadow-sm"
        >
          {filters}
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
