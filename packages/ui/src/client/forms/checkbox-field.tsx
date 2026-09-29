"use client"

import { Checkbox } from "@plainworks/elements/checkbox"
import type { ComponentProps, ReactElement } from "react"
import { Field } from "./field"
import type { BaseFieldProps, ControlProps } from "./field-props"

/** Props for {@link CheckboxField} — a labelled boolean checkbox, inline by default. */
export interface CheckboxFieldProps
  extends BaseFieldProps,
    ControlProps<ComponentProps<typeof Checkbox>> {}

/** A labelled boolean checkbox. */
export function CheckboxField({
  name,
  label,
  description,
  orientation = "horizontal",
  required,
  disabled,
  className,
  ...checkboxProps
}: CheckboxFieldProps): ReactElement {
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
      {(control) => <Checkbox {...checkboxProps} {...control} />}
    </Field>
  )
}
