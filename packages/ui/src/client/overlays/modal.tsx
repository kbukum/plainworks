"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@plainworks/elements/dialog"
import { isValidElement, type ReactElement, type ReactNode, useId } from "react"
import { OverlayBody } from "./body"

/** Props for {@link Modal}. */
export interface ModalProps {
  /** The dialog's accessible name. Required — a dialog with no title is not labelled. */
  readonly title: ReactNode
  /** Supporting copy announced with the dialog. */
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
  /** Controlled open state. */
  readonly open?: boolean
  /** Initial open state while uncontrolled. */
  readonly defaultOpen?: boolean
  /** Called with the requested next open state. */
  readonly onOpenChange?: (open: boolean) => void
  /** Show the built-in close affordance in the corner. Defaults to true. */
  readonly showCloseButton?: boolean
}

/**
 * A ready-made centered dialog built on the `dialog` atom — a wrapper (the layer-safe place to
 * deviate), not an edited atom. It always renders a `DialogTitle`, so the surface is labelled by
 * construction; `open`/`onOpenChange` keep it controllable. A body taller than the screen
 * scrolls on its own while the title and footer actions stay in view.
 */
export function Modal({
  title,
  description,
  children,
  footer,
  trigger,
  open,
  defaultOpen,
  onOpenChange,
  showCloseButton = true,
}: ModalProps): ReactElement {
  const titleId = useId()
  return (
    <Dialog open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger === undefined ? null : isValidElement(trigger) ? (
        <DialogTrigger render={trigger} />
      ) : (
        <DialogTrigger>{trigger}</DialogTrigger>
      )}
      {/* The theme bounds the popup to the viewport; only the body scrolls inside that bound. */}
      <DialogContent showCloseButton={showCloseButton} className="flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle id={titleId}>{title}</DialogTitle>
          {description === undefined ? null : <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children === undefined ? null : (
          // The edge-to-edge inset keeps the scrollbar at the rim and focus rings unclipped.
          <OverlayBody
            slot="modal-body"
            labelledBy={titleId}
            className="-mx-4 -my-1 min-h-0 flex-1 overflow-y-auto px-4 py-1"
            contentClassName="grid gap-4"
          >
            {children}
          </OverlayBody>
        )}
        {footer === undefined ? null : <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}
