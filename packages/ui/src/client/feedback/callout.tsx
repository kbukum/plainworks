"use client"

import { Alert, AlertDescription, AlertTitle } from "@plainworks/elements/alert"
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
// screen reader is not preempted. `danger` also maps to the atom's destructive styling.
const URGENT: ReadonlySet<CalloutTone> = new Set<CalloutTone>(["warning", "danger"])

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
      className={className}
    >
      {icon}
      {title === undefined ? null : <AlertTitle>{title}</AlertTitle>}
      {children === undefined ? null : <AlertDescription>{children}</AlertDescription>}
    </Alert>
  )
}
