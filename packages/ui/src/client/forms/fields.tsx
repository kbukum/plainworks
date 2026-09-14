"use client"

import { Checkbox } from "@plainworks/elements/checkbox"
import { Input } from "@plainworks/elements/input"
import { NativeSelect, NativeSelectOption } from "@plainworks/elements/native-select"
import { Switch } from "@plainworks/elements/switch"
import { Textarea } from "@plainworks/elements/textarea"
import type { ComponentProps, ReactElement } from "react"
import { Field, type FieldProps } from "./field"

// The field-level props every wrapper forwards to `Field`; the control-specific props are layered
// on per field. `children` is owned by the wrapper (it supplies the control), never by the caller.
type BaseFieldProps = Omit<FieldProps, "children">

// A control's own props minus everything `Field` injects through its render prop, so a caller can
// never break the id/label/validation wiring by passing `id`, `name`, `disabled`, or the ARIA
// attributes directly. `children` is dropped too: every wrapper supplies its own control (and the
// select its own options), so a caller passing `children` would otherwise be spread onto a void
// `<input>` and crash at runtime.
type ControlProps<T> = Omit<
  T,
  | "id"
  | "name"
  | "aria-invalid"
  | "aria-describedby"
  | "disabled"
  | "required"
  | "className"
  | "children"
>

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
