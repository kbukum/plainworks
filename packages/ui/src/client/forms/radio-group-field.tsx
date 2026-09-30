"use client"

import { FieldDescription, FieldError, FieldTitle } from "@plainworks/elements/field"
import { RadioGroup, RadioGroupItem } from "@plainworks/elements/radio-group"
import { cn } from "@plainworks/theme"
import { type ReactElement, type ReactNode, useId } from "react"
import { useFieldErrors, useFormContext } from "./form-context"

/** One choice in a {@link RadioGroupField}. */
export interface RadioGroupFieldOption<T extends string = string> {
  readonly value: T
  readonly label: ReactNode
  /** Optional helper text, read with the choice. */
  readonly description?: ReactNode
  readonly disabled?: boolean
}

/** Props for {@link RadioGroupField} — a labelled group of mutually exclusive choices. */
export interface RadioGroupFieldProps<T extends string = string> {
  /** Field name — submitted in `FormData` and the key its validation messages are grouped under. */
  readonly name: string
  /** Visible label that names the group. */
  readonly label: ReactNode
  /** Choices in display order. */
  readonly options: readonly RadioGroupFieldOption<T>[]
  /** Optional helper text for the whole group. */
  readonly description?: ReactNode
  /** The chosen value, for a controlled group. */
  readonly value?: T | undefined
  /** The initial choice of an uncontrolled group. */
  readonly defaultValue?: T | undefined
  /** Called with the new choice; only ever one of the options' values. */
  readonly onValueChange?: ((value: T) => void) | undefined
  readonly required?: boolean | undefined
  readonly disabled?: boolean | undefined
  readonly className?: string | undefined
}

/**
 * A labelled radio group where each choice is a card with a label and an optional description. The
 * visible label names the group, arrow keys move the choice, and the value submits through
 * `FormData`. Validation messages come from the enclosing `<Form>` by `name`; outside a form the
 * group renders as valid.
 */
export function RadioGroupField<T extends string>({
  name,
  label,
  options,
  description,
  value,
  defaultValue,
  onValueChange,
  required,
  disabled,
  className,
}: RadioGroupFieldProps<T>): ReactElement {
  const errors = useFieldErrors(name)
  const { pending } = useFormContext()
  const baseId = useId()
  const labelId = `${baseId}label`
  const descriptionId = `${baseId}description`
  const errorId = `${baseId}error`
  const invalid = errors.length > 0
  const describedBy =
    [description === undefined ? null : descriptionId, invalid ? errorId : null]
      .filter((id) => id !== null)
      .join(" ") || undefined

  return (
    <div data-invalid={invalid || undefined} className={cn("grid gap-3", className)}>
      <div className="grid gap-1">
        <FieldTitle id={labelId}>
          {label}
          {required ? (
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
          ) : null}
        </FieldTitle>
        {description === undefined ? null : (
          <FieldDescription id={descriptionId}>{description}</FieldDescription>
        )}
      </div>
      <RadioGroup
        name={name}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        disabled={disabled || pending || undefined}
        value={value}
        defaultValue={defaultValue}
        onValueChange={(next) => {
          const option = options.find((candidate) => candidate.value === next)
          if (option !== undefined) onValueChange?.(option.value)
        }}
        className="gap-3"
      >
        {options.map((option) => {
          const optionId = `${baseId}${option.value}`
          return (
            <label
              key={option.value}
              htmlFor={optionId}
              className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border/70 p-3 has-data-checked:border-primary has-data-disabled:cursor-not-allowed has-data-disabled:opacity-60"
            >
              <RadioGroupItem
                id={optionId}
                value={option.value}
                disabled={option.disabled}
                aria-labelledby={`${optionId}-label`}
                aria-describedby={
                  option.description === undefined ? undefined : `${optionId}-description`
                }
                className="mt-0.5"
              />
              <span className="grid gap-0.5">
                <span id={`${optionId}-label`} className="text-sm font-medium">
                  {option.label}
                </span>
                {option.description === undefined ? null : (
                  <span id={`${optionId}-description`} className="text-sm text-muted-foreground">
                    {option.description}
                  </span>
                )}
              </span>
            </label>
          )
        })}
      </RadioGroup>
      {invalid ? <FieldError id={errorId} errors={errors.map((message) => ({ message }))} /> : null}
    </div>
  )
}
