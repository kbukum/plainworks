"use client"

import { cn } from "@plainworks/theme"
import type { ComponentProps, ReactElement } from "react"
import { GAP_CLASS, type Gap } from "./gap"

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
