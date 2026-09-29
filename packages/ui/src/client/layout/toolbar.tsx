"use client"

import { cn } from "@plainworks/theme"
import type { ReactElement, ReactNode } from "react"

/** Props for {@link Toolbar}. */
export interface ToolbarProps {
  /** Accessible name for the control group, e.g. `"Order controls"`. */
  readonly label: string
  /** The controls that shape the content: search, filters, view options. */
  readonly children: ReactNode
  /** Actions on the content, such as export or bulk edit. They sit at the end of the row. */
  readonly actions?: ReactNode
  readonly className?: string
}

/**
 * A labelled row of controls above a content region. Controls lead and actions trail in a wide
 * container; in a narrow one both stack full width, so nothing is clipped or pushed off screen.
 *
 * It is a labelled `fieldset` (a `group`), not an ARIA `toolbar`: the controls keep their normal
 * Tab order instead of the arrow-key roving focus a `toolbar` role promises. `min-w-0` overrides a
 * fieldset's `min-content` minimum so it can shrink to a narrow container.
 */
export function Toolbar({ label, children, actions, className }: ToolbarProps): ReactElement {
  return (
    <fieldset
      aria-label={label}
      data-slot="toolbar"
      className={cn(
        "@container/toolbar flex min-w-0 flex-col gap-2 @2xl/toolbar:flex-row @2xl/toolbar:items-start @2xl/toolbar:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-start gap-2">{children}</div>
      {actions === undefined ? null : (
        <div data-slot="toolbar-actions" className="flex shrink-0 flex-wrap gap-2">
          {actions}
        </div>
      )}
    </fieldset>
  )
}
