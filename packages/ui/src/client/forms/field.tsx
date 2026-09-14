"use client"

import {
  FieldDescription,
  FieldError,
  FieldLabel,
  Field as FieldRoot,
} from "@plainworks/elements/field"
import { type ReactElement, type ReactNode, useId } from "react"
import { useFieldErrors, useFormContext } from "./form-context"

/**
 * The wiring a {@link Field} injects into its control through the render prop: a stable `id`
 * matching the label's `htmlFor`, the field `name` used both for submission and to look up
 * validation messages, and the `aria-describedby`/`aria-invalid`/`disabled`/`required` attributes
 * that keep the control and its label, description, and error programmatically associated.
 */
export interface FieldControlProps {
  readonly id: string
  readonly name: string
  readonly "aria-describedby"?: string | undefined
  readonly "aria-invalid"?: true | undefined
  readonly disabled?: boolean | undefined
  readonly required?: boolean | undefined
}

/** Layout of a field's label relative to its control — text fields stack, toggles sit inline. */
export type FieldOrientation = "vertical" | "horizontal"

/** Props for {@link Field}. */
export interface FieldProps {
  /** Field name — submitted in `FormData` and the key its validation messages are grouped under. */
  readonly name: string
  /** Visible, associated label. */
  readonly label: ReactNode
  /** Renders the control, receiving the {@link FieldControlProps} to spread onto it. */
  readonly children: (control: FieldControlProps) => ReactNode
  /** Optional helper text, associated through `aria-describedby`. */
  readonly description?: ReactNode
  /** Label placement. Defaults to `vertical`. */
  readonly orientation?: FieldOrientation | undefined
  /** Marks the field required (semantic/ARIA only — the form submits through Actions, not native validation). */
  readonly required?: boolean | undefined
  /** Disables the control regardless of form pending state. */
  readonly disabled?: boolean | undefined
  readonly className?: string | undefined
}

/**
 * A labelled form field that owns the accessibility wiring so each control does not repeat it: it
 * generates the `id`/`htmlFor` pairing, associates description and error through
 * `aria-describedby`, reflects validation state with `aria-invalid`, and disables while the form is
 * pending. Validation messages come from the enclosing `<Form>` context keyed by `name`; outside a
 * form the field simply renders as valid. The control itself is supplied through the render prop,
 * so one `Field` serves every input type.
 */
export function Field({
  name,
  label,
  children,
  description,
  orientation = "vertical",
  required,
  disabled,
  className,
}: FieldProps): ReactElement {
  const errors = useFieldErrors(name)
  const { pending } = useFormContext()
  const baseId = useId()
  const controlId = `${baseId}control`
  const descriptionId = `${baseId}description`
  const errorId = `${baseId}error`
  const invalid = errors.length > 0

  const describedBy =
    [description !== undefined ? descriptionId : null, invalid ? errorId : null]
      .filter((id) => id !== null)
      .join(" ") || undefined

  const control: FieldControlProps = {
    id: controlId,
    name,
    "aria-describedby": describedBy,
    "aria-invalid": invalid ? true : undefined,
    disabled: disabled || pending || undefined,
    required: required || undefined,
  }

  return (
    <FieldRoot orientation={orientation} data-invalid={invalid || undefined} className={className}>
      <FieldLabel htmlFor={controlId}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        ) : null}
      </FieldLabel>
      {children(control)}
      {description === undefined ? null : (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      )}
      {invalid ? <FieldError id={errorId} errors={errors.map((message) => ({ message }))} /> : null}
    </FieldRoot>
  )
}
