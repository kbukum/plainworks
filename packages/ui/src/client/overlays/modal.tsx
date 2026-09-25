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
import { isValidElement, type ReactElement, type ReactNode } from "react"

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
 * construction; `open`/`onOpenChange` keep it controllable.
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
  return (
    <Dialog open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger === undefined ? null : isValidElement(trigger) ? (
        <DialogTrigger render={trigger} />
      ) : (
        <DialogTrigger>{trigger}</DialogTrigger>
      )}
      <DialogContent showCloseButton={showCloseButton}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description === undefined ? null : <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        {footer === undefined ? null : <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}
