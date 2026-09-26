"use client"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@plainworks/elements/sheet"
import { isValidElement, type ReactElement, type ReactNode } from "react"

/** Which edge the drawer slides in from. */
export type DrawerSide = "top" | "right" | "bottom" | "left"

/** Props for {@link Drawer}. */
export interface DrawerProps {
  /** The drawer's accessible name. Required — an unlabelled drawer fails a11y. */
  readonly title: ReactNode
  /** Supporting copy announced with the drawer. */
  readonly description?: ReactNode
  /** Body content. */
  readonly children?: ReactNode
  /** Footer content (actions). */
  readonly footer?: ReactNode
  /**
   * The trigger: a label rendered inside the trigger button, or an element to render *as* the
   * trigger. Omit when driving `open` yourself.
   */
  readonly trigger?: ReactNode
  /** Edge to slide in from. Defaults to `right`. */
  readonly side?: DrawerSide
  /** Controlled open state. */
  readonly open?: boolean
  /** Initial open state while uncontrolled. */
  readonly defaultOpen?: boolean
  /** Called with the requested next open state. */
  readonly onOpenChange?: (open: boolean) => void
}

/**
 * A ready-made edge drawer built on the `sheet` atom — a wrapper, not an edited atom. It always
 * renders a `SheetTitle` so the surface is labelled, and stays controllable through
 * `open`/`onOpenChange`.
 */
export function Drawer({
  title,
  description,
  children,
  footer,
  trigger,
  side = "right",
  open,
  defaultOpen,
  onOpenChange,
}: DrawerProps): ReactElement {
  return (
    <Sheet open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger === undefined ? null : isValidElement(trigger) ? (
        <SheetTrigger render={trigger} />
      ) : (
        <SheetTrigger>{trigger}</SheetTrigger>
      )}
      <SheetContent side={side}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description === undefined ? null : <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        {children}
        {footer === undefined ? null : <SheetFooter>{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  )
}
