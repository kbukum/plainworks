"use client"

import { NativeSelect, NativeSelectOption } from "@plainworks/elements/native-select"
import type { ComponentProps, ReactElement } from "react"
import { Field } from "./field"
import type { BaseFieldProps, ControlProps } from "./field-props"

/** One option in a {@link SelectField}. */
export interface SelectFieldOption {
  readonly value: string
  readonly label: string
  readonly disabled?: boolean
}

/** Props for {@link SelectField} — a labelled native single-select. */
export interface SelectFieldProps
  extends BaseFieldProps,
    ControlProps<ComponentProps<typeof NativeSelect>> {
  /** Options in display order. */
  readonly options: readonly SelectFieldOption[]
  /** Optional non-selectable placeholder rendered as the first, empty-valued option. */
  readonly placeholder?: string
}

/** A labelled native single-select; native so it submits through `FormData` and stays SSR-stable. */
export function SelectField({
  name,
  label,
  description,
  orientation,
  required,
  disabled,
  className,
  options,
  placeholder,
  ...selectProps
}: SelectFieldProps): ReactElement {
  // Only seed the placeholder as `defaultValue` when the caller has not supplied a controlled
  // `value`; mixing `defaultValue` with a controlled `value` makes React warn about switching
  // modes.
  const isControlled = "value" in selectProps && selectProps.value !== undefined
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
      {(control) => (
        <NativeSelect
          defaultValue={placeholder === undefined || isControlled ? undefined : ""}
          {...selectProps}
          {...control}
        >
          {placeholder === undefined ? null : (
            <NativeSelectOption value="" disabled>
              {placeholder}
            </NativeSelectOption>
          )}
          {options.map((option) => (
            <NativeSelectOption key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
    </Field>
  )
}
