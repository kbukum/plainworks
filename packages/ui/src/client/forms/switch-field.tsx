"use client"

import { Switch } from "@plainworks/elements/switch"
import type { ComponentProps, ReactElement } from "react"
import { Field } from "./field"
import type { BaseFieldProps, ControlProps } from "./field-props"

/** Props for {@link SwitchField} — a labelled boolean switch, inline by default. */
export interface SwitchFieldProps
  extends BaseFieldProps,
    ControlProps<ComponentProps<typeof Switch>> {}

/** A labelled boolean switch. */
export function SwitchField({
  name,
  label,
  description,
  orientation = "horizontal",
  required,
  disabled,
  className,
  ...switchProps
}: SwitchFieldProps): ReactElement {
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
      {(control) => <Switch {...switchProps} {...control} />}
    </Field>
  )
}
