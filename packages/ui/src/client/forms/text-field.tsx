"use client"

import { Input } from "@plainworks/elements/input"
import type { ComponentProps, ReactElement } from "react"
import { Field } from "./field"
import type { BaseFieldProps, ControlProps } from "./field-props"

/** Props for {@link TextField} — a labelled single-line text input. */
export interface TextFieldProps
  extends BaseFieldProps,
    ControlProps<ComponentProps<typeof Input>> {}

/** A labelled single-line text input. */
export function TextField({
  name,
  label,
  description,
  orientation,
  required,
  disabled,
  className,
  ...inputProps
}: TextFieldProps): ReactElement {
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
      {(control) => <Input {...inputProps} {...control} />}
    </Field>
  )
}
