"use client"

import { Button } from "@plainworks/elements/button"
import type { ComponentProps, ReactElement, ReactNode } from "react"
import { useFormStatus } from "react-dom"
import { useFormContext } from "./form-context"

/** Props for {@link FormSubmit}. Extends the underlying button, minus its always-`submit` `type`. */
export interface FormSubmitProps extends Omit<ComponentProps<typeof Button>, "type"> {
  /** Content shown while the form action is running; falls back to `children` when omitted. */
  readonly pendingLabel?: ReactNode
}

/**
 * A submit button that disables itself while the enclosing form is submitting, marks the form busy
 * for assistive tech, and can swap in `pendingLabel`. Inside a `<Form>` it reads the form's pending
 * state from context; inside a raw `<form action>` it falls back to `useFormStatus`, so it works in
 * both. Must be rendered within a form for the status to be real.
 */
export function FormSubmit({
  children,
  pendingLabel,
  disabled,
  ...props
}: FormSubmitProps): ReactElement {
  // `Form` drives submission through `onSubmit` + a transition, which `useFormStatus` does not
  // observe; its authoritative pending flag comes through `FormContext`. Combine both so the button
  // is pending-aware under `<Form>` and under a native `<form action>`.
  const { pending: actionPending } = useFormStatus()
  const { pending: contextPending } = useFormContext()
  const pending = actionPending || contextPending
  return (
    <Button
      {...props}
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending || undefined}
    >
      {pending && pendingLabel !== undefined ? pendingLabel : children}
    </Button>
  )
}
