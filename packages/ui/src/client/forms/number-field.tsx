"use client"

import {
  NumberField as NumberFieldControl,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@plainworks/elements/number-field"
import type { ComponentProps, ReactElement } from "react"
import { Field } from "./field"
import type { BaseFieldProps, ControlProps } from "./field-props"

/** The accessible names of a number field's stepper buttons. */
export interface NumberFieldLabels {
  readonly increment: string
  readonly decrement: string
}

export const defaultNumberFieldLabels: NumberFieldLabels = {
  increment: "Increase",
  decrement: "Decrease",
}

/**
 * Props for {@link NumberField}: a labelled number input with steppers. Value, bounds, step, and
 * locale formatting are the number-field atom's own props.
 */
export interface NumberFieldProps
  extends BaseFieldProps,
    ControlProps<ComponentProps<typeof NumberFieldControl>> {
  readonly labels?: Partial<NumberFieldLabels> | undefined
  readonly placeholder?: string | undefined
}

/**
 * A labelled number field. It parses and formats by locale, steps with the arrow keys and the
 * stepper buttons, clamps to `min`/`max`, and submits the plain number under `name`.
 */
export function NumberField({
  name,
  label,
  description,
  orientation,
  required,
  disabled,
  className,
  labels,
  placeholder,
  ...controlProps
}: NumberFieldProps): ReactElement {
  const names = { ...defaultNumberFieldLabels, ...labels }
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
      {({ id, "aria-describedby": describedBy, "aria-invalid": invalid, ...control }) => (
        <NumberFieldControl id={id} {...controlProps} {...control}>
          <NumberFieldGroup>
            <NumberFieldDecrement aria-label={names.decrement} />
            <NumberFieldInput
              placeholder={placeholder}
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
            <NumberFieldIncrement aria-label={names.increment} />
          </NumberFieldGroup>
        </NumberFieldControl>
      )}
    </Field>
  )
}
