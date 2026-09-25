"use client"

import { cn } from "@plainworks/theme"
import type { ReactElement } from "react"

/** Props for {@link Spinner}. */
export interface SpinnerProps {
  /** Accessible loading label, announced to screen readers. Defaults to `"Loading"`. */
  readonly label?: string
  /** Visual size. Defaults to `md`. */
  readonly size?: "sm" | "md" | "lg"
  readonly className?: string
}

const SIZE_CLASS = { sm: "size-4", md: "size-6", lg: "size-8" } as const

/**
 * A busy indicator with an accessible `status` role and an `sr-only` label. The animation is
 * disabled under `prefers-reduced-motion`, and the SVG is `aria-hidden` so only the label is
 * announced.
 */
export function Spinner({ label = "Loading", size = "md", className }: SpinnerProps): ReactElement {
  return (
    <span role="status" className={cn("inline-flex items-center align-middle", className)}>
      <svg
        data-slot="spinner"
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={cn(
          "animate-spin motion-reduce:animate-none text-muted-foreground",
          SIZE_CLASS[size],
        )}
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeWidth="4"
        />
        <path
          d="M12 2a10 10 0 0 1 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  )
}
