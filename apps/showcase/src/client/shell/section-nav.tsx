"use client"

import { NavList } from "@plainworks/ui/navigation/nav-list"
import type { ReactElement } from "react"
import { SECTIONS, sectionForPath } from "../../app/navigation"
import { routerLinkRender, useRouter } from "../router"

/** Props for {@link SectionNav}. */
export interface SectionNavProps {
  /** Accessible name for this navigation landmark — unique per instance (rail vs. drawer). */
  readonly label: string
  /** Called after a link is activated, so the drawer can close itself. */
  readonly onNavigate?: () => void
}

/**
 * The primary section navigation: the kit's `NavList` over the shared route map. The current
 * section comes from the router path, so the rail and the drawer always agree, and every link goes
 * through the router's link seam.
 */
export function SectionNav({ label, onNavigate }: SectionNavProps): ReactElement {
  const { path, navigate } = useRouter()
  const active = sectionForPath(path)
  return (
    <NavList
      label={label}
      renderLink={routerLinkRender(navigate)}
      {...(onNavigate === undefined ? {} : { onNavigate })}
      items={SECTIONS.map(({ id, label: name, path: href, icon: Icon }) => ({
        id,
        label: name,
        href,
        icon: <Icon aria-hidden className="size-4" />,
        current: id === active.id,
      }))}
    />
  )
}
