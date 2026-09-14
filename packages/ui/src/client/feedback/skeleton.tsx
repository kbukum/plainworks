"use client"

import { Skeleton } from "@plainworks/elements/skeleton"
import { cn } from "@plainworks/theme"
import type { ReactElement } from "react"

/** Props for {@link SkeletonText}. */
export interface SkeletonTextProps {
  /** Number of placeholder lines. Defaults to 3 (minimum 1). */
  readonly lines?: number
  readonly className?: string
}

/**
 * A multi-line loading placeholder built on the `skeleton` atom. It is `aria-hidden` (decorative) —
 * pair it with a labelled `status` region so assistive tech hears "loading", not a run of empty
 * boxes. The last line is short to read as a paragraph tail.
 */
export function SkeletonText({ lines = 3, className }: SkeletonTextProps): ReactElement {
  const count = Number.isFinite(lines) ? Math.max(1, Math.floor(lines)) : 3
  return (
    <div
      data-slot="skeleton-text"
      aria-hidden="true"
      className={cn("flex flex-col gap-2", className)}
    >
      {Array.from({ length: count }, (_, index) => (
        <Skeleton
          key={`skeleton-line-${index}`}
          className={cn("h-4 motion-reduce:animate-none", index === count - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  )
}
