"use client"

import { cn } from "@plainworks/theme"
import type { ComponentProps, ReactElement } from "react"
import { GAP_CLASS, type Gap } from "./gap"

/** Props for {@link Grid}. */
export interface GridProps extends ComponentProps<"div"> {
  /**
   * Minimum column width before wrapping, as a CSS length (e.g. `"16rem"`). The grid fills the row
   * with as many equal columns of at least this width as fit — a fluid `auto-fit` / `minmax` track,
   * never a fixed column count, so it reflows from mobile to wide with no media query.
   */
  readonly minColumnWidth?: string
  /** Gap between cells. Defaults to `md`. */
  readonly gap?: Gap
}

/**
 * A responsive, fluid CSS grid that reflows by available width rather than a fixed column count.
 */
export function Grid({
  minColumnWidth = "16rem",
  gap = "md",
  className,
  style,
  ...props
}: GridProps): ReactElement {
  return (
    <div
      data-slot="grid"
      className={cn("grid", GAP_CLASS[gap], className)}
      // Inline style carries the one dynamic track value; `min()` keeps a single wide child
      // from overflowing a narrow container.
      style={{
        gridTemplateColumns: `repeat(auto-fit, minmax(min(${minColumnWidth}, 100%), 1fr))`,
        ...style,
      }}
      {...props}
    />
  )
}
