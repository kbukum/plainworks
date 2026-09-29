"use client"

import { cn } from "@plainworks/theme"
import type { ComponentProps, ReactElement } from "react"

/** The content measure a {@link Page} bounds itself to. */
export type PageWidth = "prose" | "default" | "full"

const WIDTH_CLASS = {
  prose: "max-w-3xl",
  default: "max-w-7xl",
  full: "max-w-none",
} as const satisfies Record<PageWidth, string>

/** Props for {@link Page}. */
export interface PageProps extends ComponentProps<"div"> {
  /** Maximum content width. Defaults to `default`; use `prose` for reading-first pages. */
  readonly width?: PageWidth
}

/**
 * The content frame of one screen: a centered, width-bounded column with the theme's section rhythm
 * between its children. It is a container-query root (`@container/page`), so everything inside
 * adapts to the space the app shell leaves rather than the viewport. It renders no landmark — the
 * app shell owns `<main>` — and no horizontal padding, which the shell also owns.
 */
export function Page({ width = "default", className, ...props }: PageProps): ReactElement {
  return (
    <div
      {...props}
      data-slot="page"
      data-width={width}
      className={cn(
        "@container/page mx-auto flex w-full min-w-0 flex-col gap-section",
        WIDTH_CLASS[width],
        className,
      )}
    />
  )
}
