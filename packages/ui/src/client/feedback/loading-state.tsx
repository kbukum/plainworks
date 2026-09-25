"use client"

import { Skeleton } from "@plainworks/elements/skeleton"
import { cn } from "@plainworks/theme"
import type { ReactElement, ReactNode } from "react"

/** Props for {@link LoadingState}. */
export interface LoadingStateProps {
  /** What is loading, announced once to assistive tech, e.g. `"Loading orders"`. */
  readonly label: string
  /** Placeholder text lines when no `children` shape is given. Defaults to 3 (minimum 1). */
  readonly lines?: number
  /**
   * A placeholder shaped like the content it stands in for (built from `Skeleton` atoms), so the
   * layout does not jump when the data arrives. Replaces the default text lines.
   */
  readonly children?: ReactNode
  readonly className?: string
}

/**
 * The loading view of a region: a polite `status` named and announced by `label`, over a decorative
 * placeholder. The default placeholder is a paragraph of skeleton lines with a short tail; pass
 * `children` to mirror the real layout instead.
 */
export function LoadingState({
  label,
  lines = 3,
  children,
  className,
}: LoadingStateProps): ReactElement {
  const count = Number.isFinite(lines) ? Math.max(1, Math.floor(lines)) : 3
  return (
    <div data-slot="loading-state" className={cn("flex min-w-0 flex-col", className)}>
      <span role="status" aria-label={label} className="sr-only">
        {label}
      </span>
      <div data-slot="loading-state-placeholder" aria-hidden="true" className="flex flex-col gap-2">
        {children ??
          Array.from({ length: count }, (_, index) => (
            <Skeleton
              key={`line-${index}`}
              className={cn("h-4", index === count - 1 && count > 1 ? "w-2/3" : "w-full")}
            />
          ))}
      </div>
    </div>
  )
}
