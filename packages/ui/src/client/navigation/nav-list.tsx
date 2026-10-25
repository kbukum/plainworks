"use client"

import { buttonVariants } from "@plainworks/elements/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@plainworks/elements/tooltip"
import { cn } from "@plainworks/theme"
import type { AnchorHTMLAttributes, ReactElement, ReactNode } from "react"

/**
 * Renders one navigation link. Hosts pass their router's link adapter so a plain click navigates
 * client-side while the element stays a real `<a href>`. Defaults to a plain anchor.
 */
export type LinkRender = (props: AnchorHTMLAttributes<HTMLAnchorElement>) => ReactElement

/** One destination in a {@link NavList}. */
export interface NavListItem {
  /** Stable key. */
  readonly id: string
  readonly label: ReactNode
  readonly href: string
  /** Leading icon (an SVG element); injected, never imported here. Mark it `aria-hidden`. */
  readonly icon?: ReactNode
  /** Marks the current page. At most one item should be current. */
  readonly current?: boolean
}

/** Props for {@link NavList}. */
export interface NavListProps {
  /** Accessible name for the landmark. Make it unique when two lists render at once. */
  readonly label: string
  readonly items: readonly NavListItem[]
  /** The host's link adapter. Defaults to a plain anchor. */
  readonly renderLink?: LinkRender
  /** Called after any link is activated, for example to close the drawer that holds the list. */
  readonly onNavigate?: () => void
  /**
   * Shows only the icons, as in a collapsed rail. Each link keeps its label as its accessible name
   * and shows it as a tooltip on hover and focus. Give every item an icon when you use it.
   */
  readonly collapsed?: boolean
  readonly className?: string
}

const plainLink: LinkRender = (props) => <a {...props} />

/**
 * A vertical list of section links, styled from the `button` atom's variants. The current page is
 * marked with `aria-current="page"` and a filled treatment, so it never relies on color alone.
 * Routing stays with the host through `renderLink`.
 */
export function NavList({
  label,
  items,
  renderLink = plainLink,
  onNavigate,
  collapsed = false,
  className,
}: NavListProps): ReactElement {
  return (
    <nav aria-label={label} className={className}>
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const link = renderLink({
            href: item.href,
            "aria-current": item.current === true ? "page" : undefined,
            onClick: onNavigate,
            className: cn(
              buttonVariants({ variant: item.current === true ? "secondary" : "ghost" }),
              collapsed
                ? "size-control justify-center p-0"
                : "h-control w-full justify-start gap-2",
              item.current === true && "font-semibold",
            ),
            children: (
              <>
                {item.icon}
                <span className={collapsed ? "sr-only" : "min-w-0 truncate"}>{item.label}</span>
              </>
            ),
          })
          return (
            <li key={item.id}>
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger render={link} />
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                link
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
