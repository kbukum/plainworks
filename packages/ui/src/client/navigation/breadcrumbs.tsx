"use client"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  type BreadcrumbLinkProps,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@plainworks/elements/breadcrumb"
import { Fragment, type ReactElement, type ReactNode } from "react"

/** A single breadcrumb entry. */
export interface BreadcrumbEntry {
  /** Visible label. */
  readonly label: ReactNode
  /** Destination link. Omit on an intermediate entry to render it as plain, non-link text. */
  readonly href?: string
  /**
   * Host link element rendered in place of the default anchor for this entry — a Next.js `<Link>`,
   * a typed-router link — so a router-aware app gets client navigation instead of a full reload.
   * The destination and the atom's own props merge onto it. Ignored on an entry with no `href` (it
   * is plain text) or the current page. Omit to keep a plain anchor.
   */
  readonly render?: BreadcrumbLinkProps["render"]
}

/** Props for {@link Breadcrumbs}. */
export interface BreadcrumbsProps {
  /**
   * The trail, root first. The last entry is the current page; earlier entries link when they carry
   * an `href`.
   */
  readonly items: readonly BreadcrumbEntry[]
  /** Accessible name for the landmark. Defaults to `"Breadcrumb"`. */
  readonly label?: string
  /** Custom separator node between entries. */
  readonly separator?: ReactNode
}

/**
 * A ready-made breadcrumb trail built from an items array on the `breadcrumb` atom — a wrapper, not
 * an edited atom. Exactly the final entry renders as the `aria-current` page; an earlier entry is a
 * link when it has an `href`, otherwise plain text — so the trail never carries two current pages.
 * Separators are `aria-hidden` so the trail reads cleanly.
 */
export function Breadcrumbs({
  items,
  label = "Breadcrumb",
  separator,
}: BreadcrumbsProps): ReactElement {
  const lastIndex = items.length - 1
  return (
    <Breadcrumb aria-label={label}>
      <BreadcrumbList>
        {items.map((item, index) => {
          const isCurrent = index === lastIndex
          return (
            <Fragment key={`${index}-${item.href ?? ""}`}>
              <BreadcrumbItem>
                {isCurrent ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : item.href === undefined ? (
                  item.label
                ) : (
                  <BreadcrumbLink href={item.href} render={item.render}>
                    {item.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {index === lastIndex ? null : <BreadcrumbSeparator>{separator}</BreadcrumbSeparator>}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
