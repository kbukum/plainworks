"use client"

import { Textarea } from "@plainworks/elements/textarea"
import type { ComponentProps, ReactElement } from "react"
import { Field } from "./field"
import type { BaseFieldProps, ControlProps } from "./field-props"

/** Props for {@link TextareaField} — a labelled multi-line text input. */
export interface TextareaFieldProps
  extends BaseFieldProps,
    ControlProps<ComponentProps<typeof Textarea>> {}

/** A labelled multi-line text input. */
export function TextareaField({
  name,
  label,
  description,
  orientation,
  required,
  disabled,
  className,
  ...textareaProps
}: TextareaFieldProps): ReactElement {
  return (
    <Field
      name={name}
      label={label}
      description={description}
      orientation={orientation}
      required={required}
      disabled={disabled}
      className={className}
    >
      {(control) => <Textarea {...textareaProps} {...control} />}
    </Field>
  )
}
