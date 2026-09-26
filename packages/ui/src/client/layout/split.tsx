"use client"

import { cn } from "@plainworks/theme"
import type { ComponentProps, ReactElement } from "react"
import { GAP_CLASS, type Gap } from "./gap"

/** Props for {@link Split}. */
export interface SplitProps extends ComponentProps<"div"> {
  /** The fixed-basis side region (e.g. a sidebar); the main region takes the remaining space. */
  readonly side: ReactElement
  /** Which edge the side sits on. Defaults to `start`. */
  readonly sidePlacement?: "start" | "end"
  /** Preferred basis of the side region, as a CSS length. Defaults to `16rem`. */
  readonly sideBasis?: string
  /** Gap between the two regions. Defaults to `md`. */
  readonly gap?: Gap
}

/**
 * A two-region layout — a basis-sized side (sidebar/aside) next to a flexible main region — that
 * wraps to stacked on narrow widths. The side is rendered in an `<aside>` for semantics; `children`
 * is the main content.
 */
export function Split({
  side,
  sidePlacement = "start",
  sideBasis = "16rem",
  gap = "md",
  className,
  children,
  style,
  ...props
}: SplitProps): ReactElement {
  const aside = (
    <aside data-slot="split-side" className="grow-0 shrink basis-(--split-basis)">
      {side}
    </aside>
  )
  const main = (
    <div data-slot="split-main" className="grow shrink basis-64 min-w-0">
      {children}
    </div>
  )
  return (
    <div
      {...props}
      data-slot="split"
      className={cn("flex flex-wrap", GAP_CLASS[gap], className)}
      // Merge the caller style, then set the required custom property last so a passed `style` (via
      // the spread props above) can never drop `--split-basis`.
      style={{ ...style, ["--split-basis" as string]: sideBasis }}
    >
      {sidePlacement === "start" ? aside : main}
      {sidePlacement === "start" ? main : aside}
    </div>
  )
}
