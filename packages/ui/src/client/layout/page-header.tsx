"use client"

import { cn } from "@plainworks/theme"
import type { AnchorHTMLAttributes, ReactElement, ReactNode } from "react"

/** Renders one tab link through the host's router; the same shape as `NavList`'s `renderLink`. */
export type TabLinkRender = (props: AnchorHTMLAttributes<HTMLAnchorElement>) => ReactElement

/** One view of the object a {@link PageHeader} describes. */
export interface PageHeaderTab {
  readonly id: string
  readonly label: ReactNode
  readonly href: string
  /** Marks the view on screen. At most one tab should be current. */
  readonly current?: boolean
}

/** The views under a {@link PageHeader}: links, so every view has its own URL. */
export interface PageHeaderTabs {
  /** Accessible name of the tab navigation. */
  readonly label: string
  readonly items: readonly PageHeaderTab[]
  /** The host's link adapter. Defaults to a plain anchor. */
  readonly renderLink?: TabLinkRender
}

const plainLink: TabLinkRender = (props) => <a {...props} />

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
  /** The object's identifier under the title, typically an `Identifier`. */
  readonly identifier?: ReactNode
  /** The object's views, as a row of links under the header. */
  readonly tabs?: PageHeaderTabs
  readonly className?: string
}

/**
 * The top of a page: optional wayfinding, the one `h1`, the object's identifier, a description,
 * the page actions, and the object's views as link tabs. The
 * actions sit beside the title in a wide container and wrap below it in a narrow one. It renders a
 * plain `div`, not `<header>`, so it can never add a second banner landmark to the app shell.
 */
export function PageHeader({
  title,
  description,
  actions,
  navigation,
  identifier,
  tabs,
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
          {identifier === undefined ? null : (
            <div data-slot="page-header-identifier" className="text-muted-foreground">
              {identifier}
            </div>
          )}
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
      {tabs === undefined ? null : <HeaderTabs {...tabs} />}
    </div>
  )
}

function HeaderTabs({ label, items, renderLink = plainLink }: PageHeaderTabs): ReactElement {
  return (
    <nav
      aria-label={label}
      data-slot="page-header-tabs"
      className="-mb-px overflow-x-auto border-b"
    >
      <ul className="flex min-w-max gap-1">
        {items.map((item) => (
          <li key={item.id}>
            {renderLink({
              href: item.href,
              "aria-current": item.current === true ? "page" : undefined,
              className: cn(
                "inline-flex h-control items-center border-b-2 px-3 text-body outline-none focus-visible:ring-2 focus-visible:ring-ring",
                item.current === true
                  ? "border-primary font-semibold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              ),
              children: item.label,
            })}
          </li>
        ))}
      </ul>
    </nav>
  )
}
