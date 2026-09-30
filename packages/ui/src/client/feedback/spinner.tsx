"use client"

import { Spinner as SpinnerAtom } from "@plainworks/elements/spinner"
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
 * A busy indicator with an accessible `status` role and an `sr-only` label. The visual is the
 * vendored spinner atom, hidden from assistive tech so only the label is announced; the theme stops
 * its animation under reduced motion.
 */
export function Spinner({ label = "Loading", size = "md", className }: SpinnerProps): ReactElement {
  return (
    <span role="status" className={cn("inline-flex items-center align-middle", className)}>
      {/* The atom names itself "Loading"; the wrapper owns the name, so the visual is decorative. */}
      <SpinnerAtom
        role="none"
        aria-label={undefined}
        aria-hidden="true"
        className={cn("text-muted-foreground", SIZE_CLASS[size])}
      />
      <span className="sr-only">{label}</span>
    </span>
  )
}
