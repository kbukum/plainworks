"use client"

import { cn } from "@plainworks/theme"
import type { ReactElement, ReactNode } from "react"

/** Props for {@link PageHeader}. */
export interface PageHeaderProps {
  /** The page title, rendered as the page's single `h1`. */
  readonly title: ReactNode
  /** One short sentence on what the page is for. */
  readonly description?: ReactNode
  /** Page-level actions, such as a primary create button. Wraps under the title when narrow. */
  readonly actions?: ReactNode
  /** Wayfinding above the title, typically `Breadcrumbs`. */
  readonly navigation?: ReactNode
  readonly className?: string
}

/**
 * The top of a page: optional wayfinding, the one `h1`, a description, and the page actions. The
 * actions sit beside the title in a wide container and wrap below it in a narrow one. It renders a
 * plain `div`, not `<header>`, so it can never add a second banner landmark to the app shell.
 */
export function PageHeader({
  title,
  description,
  actions,
  navigation,
  className,
}: PageHeaderProps): ReactElement {
  return (
    <div
      data-slot="page-header"
      className={cn("@container/page-header flex min-w-0 flex-col gap-stack", className)}
    >
      {navigation}
      <div className="flex flex-col gap-stack @xl/page-header:flex-row @xl/page-header:items-start @xl/page-header:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-heading font-semibold tracking-tight text-balance">{title}</h1>
          {description === undefined ? null : (
            <p className="text-body text-muted-foreground text-pretty">{description}</p>
          )}
        </div>
        {actions === undefined ? null : (
          <div data-slot="page-header-actions" className="flex shrink-0 flex-wrap gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
