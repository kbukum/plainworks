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
import { isValidElement, type ReactElement, type ReactNode, useId } from "react"
import { OverlayBody } from "./body"

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
 * renders a `SheetTitle` so the surface is labelled, bounds every side to the viewport and gives
 * the body inset padding and its own scroll so long content never pushes the footer off screen, and
 * stays controllable through `open`/`onOpenChange`.
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
  const titleId = useId()
  return (
    <Sheet open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger === undefined ? null : isValidElement(trigger) ? (
        <SheetTrigger render={trigger} />
      ) : (
        <SheetTrigger>{trigger}</SheetTrigger>
      )}
      {/* The atom sizes top/bottom sheets to their content; the bound lets the body scroll. */}
      <SheetContent side={side} className="max-h-dvh">
        <SheetHeader>
          <SheetTitle id={titleId}>{title}</SheetTitle>
          {description === undefined ? null : <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        {children === undefined ? null : (
          <OverlayBody
            slot="drawer-body"
            labelledBy={titleId}
            className="min-h-0 flex-1 overflow-y-auto px-4 pb-4"
          >
            {children}
          </OverlayBody>
        )}
        {footer === undefined ? null : <SheetFooter>{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  )
}
