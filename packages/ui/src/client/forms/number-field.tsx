"use client"

import { Input } from "@plainworks/elements/input"
import type { ComponentProps, ReactElement } from "react"
import { Field } from "./field"
import type { BaseFieldProps, ControlProps } from "./field-props"

/** Props for {@link NumberField} — a labelled numeric input; `type` is fixed to `number`. */
export interface NumberFieldProps
  extends BaseFieldProps,
    ControlProps<Omit<ComponentProps<typeof Input>, "type">> {}

/** A labelled numeric input. */
export function NumberField({
  name,
  label,
  description,
  orientation,
  required,
  disabled,
  className,
  inputMode = "numeric",
  ...inputProps
}: NumberFieldProps): ReactElement {
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
      {(control) => <Input type="number" inputMode={inputMode} {...inputProps} {...control} />}
    </Field>
  )
}
