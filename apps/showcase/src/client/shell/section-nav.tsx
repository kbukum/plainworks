"use client"

import { buttonVariants } from "@plainworks/elements/button"
import { cn } from "@plainworks/theme"
import { Fragment, type ReactElement } from "react"
import { SECTIONS, sectionForPath } from "../../app/navigation"
import { routerLinkRender, useRouter } from "../router"

/** Props for {@link SectionNav}. */
export interface SectionNavProps {
  /** Accessible name for this navigation landmark — unique per instance (rail vs. drawer). */
  readonly label: string
  /** Called after a link is activated, so the mobile drawer can close itself. */
  readonly onNavigate?: () => void
  /** Extra classes for the `<nav>` wrapper. */
  readonly className?: string
}

/**
 * The primary section navigation — one link per section, built from the shared route map and the
 * `button` atom's variants (never an unstyled `<nav>`). The active section is derived from the
 * router path, so the rail and the mobile drawer highlight the same entry. Each link is a real
 * anchor progressively enhanced for client navigation through the router's own link seam.
 */
export function SectionNav({ label, onNavigate, className }: SectionNavProps): ReactElement {
  const { path, navigate } = useRouter()
  const active = sectionForPath(path)
  const linkRender = routerLinkRender(navigate)

  return (
    <nav aria-label={label} className={cn("flex flex-col gap-1", className)}>
      {SECTIONS.map((section) => {
        const Icon = section.icon
        const isCurrent = section.id === active.id
        return (
          <Fragment key={section.id}>
            {linkRender({
              href: section.path,
              "aria-current": isCurrent ? "page" : undefined,
              onClick: onNavigate,
              className: cn(
                buttonVariants({ variant: isCurrent ? "secondary" : "ghost" }),
                "justify-start",
              ),
              children: (
                <>
                  <Icon aria-hidden className="size-4" />
                  {section.label}
                </>
              ),
            })}
          </Fragment>
        )
      })}
    </nav>
  )
}
