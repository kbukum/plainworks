"use client"

import { Badge } from "@plainworks/elements/badge"
import { cn } from "@plainworks/theme"
import type { ReactElement, ReactNode } from "react"

/** The semantic tone of a {@link StatusBadge}, matching the theme's status roles. */
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger"

/** Props for {@link StatusBadge}. */
export interface StatusBadgeProps {
  /** Semantic tone. Defaults to `neutral`. */
  readonly tone?: StatusTone
  /** The visible status label. It carries the meaning; the tone only reinforces it. */
  readonly children: ReactNode
  readonly className?: string
}

// The atom ships no success, warning, or info variant, so those tones tint the badge with the
// status role. The theme's contrast test covers status text on a 20% tint of itself.
const TONE_CLASS = {
  neutral: "",
  info: "bg-info/15 text-info",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "",
} as const satisfies Record<StatusTone, string>

const TONE_VARIANT = {
  neutral: "secondary",
  info: "secondary",
  success: "secondary",
  warning: "secondary",
  danger: "destructive",
} as const satisfies Record<StatusTone, "secondary" | "destructive">

/**
 * A status label with a semantic tone, built on the `badge` atom — a wrapper, not an edited atom.
 * Use it for workflow state (shipped, blocked, overdue); the text always names the status, so color
 * is never the only signal.
 */
export function StatusBadge({
  tone = "neutral",
  children,
  className,
}: StatusBadgeProps): ReactElement {
  return (
    <Badge
      variant={TONE_VARIANT[tone]}
      data-tone={tone}
      className={cn(TONE_CLASS[tone], className)}
    >
      {children}
    </Badge>
  )
}
