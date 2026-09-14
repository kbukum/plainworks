"use client"

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@plainworks/elements/popover"
import { cn } from "@plainworks/theme"
import { isValidElement, type ReactElement, type ReactNode } from "react"

/** Props for {@link PopoverPanel}. */
export interface PopoverPanelProps {
  /**
   * The trigger: a label rendered inside the trigger button, or an element to render *as* the
   * trigger. Required — a popover needs an anchor.
   */
  readonly trigger: ReactNode
  /** Optional heading rendered inside the panel. */
  readonly title?: ReactNode
  /** Optional supporting copy under the heading. */
  readonly description?: ReactNode
  /** Panel content. */
  readonly children?: ReactNode
  /** Controlled open state. */
  readonly open?: boolean
  /** Initial open state while uncontrolled. */
  readonly defaultOpen?: boolean
  /** Called with the requested next open state. */
  readonly onOpenChange?: (open: boolean) => void
  /** Optional additional class name applied to the popover panel. */
  readonly className?: string
}

/**
 * A ready-made anchored popover built on the `popover` atom — a wrapper, not an edited atom. A
 * `title` and/or `description` renders in a `PopoverHeader` (each is independently optional, so a
 * description shows even without a title); controllable via `open`/`onOpenChange`.
 */
export function PopoverPanel({
  trigger,
  title,
  description,
  children,
  open,
  defaultOpen,
  onOpenChange,
  className,
}: PopoverPanelProps): ReactElement {
  return (
    <Popover open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {isValidElement(trigger) ? (
        <PopoverTrigger render={trigger} />
      ) : (
        <PopoverTrigger>{trigger}</PopoverTrigger>
      )}
      <PopoverContent
        className={cn("max-w-[calc(100vw-2rem)] motion-reduce:animate-none", className)}
      >
        {title === undefined && description === undefined ? null : (
          <PopoverHeader>
            {title === undefined ? null : <PopoverTitle>{title}</PopoverTitle>}
            {description === undefined ? null : (
              <PopoverDescription>{description}</PopoverDescription>
            )}
          </PopoverHeader>
        )}
        {children}
      </PopoverContent>
    </Popover>
  )
}
