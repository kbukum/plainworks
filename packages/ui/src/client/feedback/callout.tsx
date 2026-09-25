"use client"

import { Alert, AlertDescription, AlertTitle } from "@plainworks/elements/alert"
import { cn } from "@plainworks/theme"
import type { ReactElement, ReactNode } from "react"

/** The semantic tone of a {@link Callout}. */
export type CalloutTone = "info" | "success" | "warning" | "danger"

/** Props for {@link Callout}. */
export interface CalloutProps {
  /** Semantic tone. Defaults to `info`. */
  readonly tone?: CalloutTone
  /** Heading. */
  readonly title?: ReactNode
  /** Body copy. */
  readonly children?: ReactNode
  /** Leading icon slot (an SVG element); never imported here, always injected. */
  readonly icon?: ReactNode
  readonly className?: string
}

// Urgent tones interrupt with `alert`; informational tones use the polite `status` role so a
// screen reader is not preempted.
const URGENT: ReadonlySet<CalloutTone> = new Set<CalloutTone>(["warning", "danger"])

// The atom only styles `default` and `destructive`; the other tones color the border, title, and
// icon on the card surface, a pairing the theme's contrast test covers.
const TONE_CLASS = {
  info: "border-info text-info",
  success: "border-success text-success",
  warning: "border-warning text-warning",
  danger: "border-destructive",
} as const satisfies Record<CalloutTone, string>

/**
 * A ready-made message banner built on the `alert` atom — a wrapper, not an edited atom. It picks
 * an accessible live-region role from the tone and renders an optional injected icon, title, and
 * body.
 */
export function Callout({
  tone = "info",
  title,
  children,
  icon,
  className,
}: CalloutProps): ReactElement {
  return (
    <Alert
      variant={tone === "danger" ? "destructive" : "default"}
      role={URGENT.has(tone) ? "alert" : "status"}
      data-tone={tone}
      className={cn(TONE_CLASS[tone], className)}
    >
      {icon}
      {title === undefined ? null : <AlertTitle>{title}</AlertTitle>}
      {children === undefined ? null : <AlertDescription>{children}</AlertDescription>}
    </Alert>
  )
}
