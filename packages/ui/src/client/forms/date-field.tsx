"use client"

import { Input } from "@plainworks/elements/input"
import type { ComponentProps, ReactElement } from "react"
import { Field } from "./field"
import type { BaseFieldProps, ControlProps } from "./field-props"

/** Props for {@link DateField} — a labelled date input; `type` is fixed to `date`. */
export interface DateFieldProps
  extends BaseFieldProps,
    ControlProps<Omit<ComponentProps<typeof Input>, "type">> {}

/** A labelled date input. */
export function DateField({
  name,
  label,
  description,
  orientation,
  required,
  disabled,
  className,
  ...inputProps
}: DateFieldProps): ReactElement {
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
      {(control) => <Input type="date" {...inputProps} {...control} />}
    </Field>
  )
}
