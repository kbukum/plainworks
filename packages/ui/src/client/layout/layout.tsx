"use client"

import { cn } from "@plainworks/theme"
import type { ComponentProps, ReactElement } from "react"

/** The shared spacing scale for gaps between layout children (maps to theme spacing steps). */
export type Gap = "none" | "xs" | "sm" | "md" | "lg" | "xl"

const GAP_CLASS: Record<Gap, string> = {
  none: "gap-0",
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-8",
}

const ALIGN_CLASS = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
  baseline: "items-baseline",
} as const

const JUSTIFY_CLASS = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
  around: "justify-around",
  evenly: "justify-evenly",
} as const

/** Props for {@link Stack}. */
export interface StackProps extends ComponentProps<"div"> {
  /** Main-axis direction. Defaults to `vertical`. */
  readonly direction?: "vertical" | "horizontal"
  /** Gap between children. Defaults to `md`. */
  readonly gap?: Gap
  /** Cross-axis alignment. */
  readonly align?: keyof typeof ALIGN_CLASS
  /** Main-axis distribution. */
  readonly justify?: keyof typeof JUSTIFY_CLASS
  /** Wrap children onto multiple lines. Defaults to false. */
  readonly wrap?: boolean
}

/** A one-dimensional flex layout — the default building block for vertical/horizontal spacing. */
export function Stack({
  direction = "vertical",
  gap = "md",
  align,
  justify,
  wrap = false,
  className,
  ...props
}: StackProps): ReactElement {
  return (
    <div
      data-slot="stack"
      className={cn(
        "flex",
        direction === "vertical" ? "flex-col" : "flex-row",
        GAP_CLASS[gap],
        align && ALIGN_CLASS[align],
        justify && JUSTIFY_CLASS[justify],
        wrap && "flex-wrap",
        className,
      )}
      {...props}
    />
  )
}

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
      data-slot="split"
      className={cn("flex flex-wrap", GAP_CLASS[gap], className)}
      {...props}
      // Merge the caller style, then set the required custom property last so a passed `style` (via
      // the spread props above) can never drop `--split-basis`.
      style={{ ...style, ["--split-basis" as string]: sideBasis }}
    >
      {sidePlacement === "start" ? aside : main}
      {sidePlacement === "start" ? main : aside}
    </div>
  )
}
