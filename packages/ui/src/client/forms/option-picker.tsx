"use client"

import { Badge } from "@plainworks/elements/badge"
import { FieldDescription, FieldTitle } from "@plainworks/elements/field"
import { RadioGroup, RadioGroupItem } from "@plainworks/elements/radio-group"
import { cn } from "@plainworks/theme"
import { type ReactElement, type ReactNode, useId } from "react"

/** One choice in an {@link OptionPicker}. */
export interface PickerOption<T extends string = string> {
  readonly value: T
  /** The choice's short name, which names its radio. */
  readonly label: string
  /** A fact shown under the label and read with the choice, such as its size. */
  readonly detail?: ReactNode
  /** Short tags shown and read with the choice, such as "Recommended", each its own badge. */
  readonly badges?: readonly string[]
  /** Why the choice can't be picked; when set the choice is disabled and the reason is shown. */
  readonly disabledReason?: string
}

/** Props for {@link OptionPicker}. */
export interface OptionPickerProps<T extends string = string> {
  /** The visible label that names the group. */
  readonly label: string
  /** Helper text for the whole group. */
  readonly description?: ReactNode
  /** Choices in display order. */
  readonly options: readonly PickerOption<T>[]
  /** The picked value; `undefined` when nothing is picked. */
  readonly value: T | undefined
  /** Called with the picked choice; never with a disabled one. */
  readonly onValueChange: (value: T) => void
  readonly className?: string
}

/**
 * A row of choice cards that picks one value, such as a size or quality. Each card shows its label,
 * an optional detail and badges, and, when it can't be picked, why. Unlike `RadioGroupField` it is
 * not a form field: it submits nothing and is meant for choices that change what a page shows.
 * Arrow keys move the pick and skip disabled choices; every detail, badge and reason is read with
 * its choice. Badges wrap within a narrow card rather than overflow it.
 */
export function OptionPicker<T extends string>({
  label,
  description,
  options,
  value,
  onValueChange,
  className,
}: OptionPickerProps<T>): ReactElement {
  const baseId = useId()
  const labelId = `${baseId}label`
  const descriptionId = `${baseId}description`
  return (
    <div data-slot="option-picker" className={cn("grid gap-2", className)}>
      <div className="grid gap-1">
        <FieldTitle id={labelId}>{label}</FieldTitle>
        {description === undefined ? null : (
          <FieldDescription id={descriptionId}>{description}</FieldDescription>
        )}
      </div>
      <RadioGroup
        aria-labelledby={labelId}
        aria-describedby={description === undefined ? undefined : descriptionId}
        // An empty value keeps the group controlled while nothing is picked.
        value={value ?? ""}
        onValueChange={(next) => {
          const option = options.find((candidate) => candidate.value === next)
          if (option !== undefined && option.disabledReason === undefined)
            onValueChange(option.value)
        }}
        className="grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2"
      >
        {options.map((option, index) => {
          const optionId = `${baseId}${index}`
          const described = [
            option.detail === undefined ? null : `${optionId}-detail`,
            ...(option.badges ?? []).map((_, b) => `${optionId}-badge${b}`),
            option.disabledReason === undefined ? null : `${optionId}-reason`,
          ].filter((id) => id !== null)
          return (
            <label
              key={option.value}
              htmlFor={optionId}
              className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border border-border/70 p-3 has-data-checked:border-primary has-data-checked:bg-primary/5 has-data-disabled:cursor-not-allowed has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
            >
              <RadioGroupItem
                id={optionId}
                value={option.value}
                disabled={option.disabledReason !== undefined}
                aria-labelledby={`${optionId}-label`}
                aria-describedby={described.length > 0 ? described.join(" ") : undefined}
                className="mt-0.5"
              />
              <span className="grid min-w-0 gap-1">
                <span id={`${optionId}-label`} className="text-sm font-medium">
                  {option.label}
                </span>
                {option.detail === undefined ? null : (
                  <span id={`${optionId}-detail`} className="text-sm text-muted-foreground">
                    {option.detail}
                  </span>
                )}
                {(option.badges?.length ?? 0) === 0 ? null : (
                  <span className="flex flex-wrap gap-1">
                    {option.badges?.map((badge, b) => (
                      // The atom never wraps; a tag longer than the card must, so it never spills
                      // out.
                      <Badge
                        key={badge}
                        id={`${optionId}-badge${b}`}
                        variant="secondary"
                        className="h-auto max-w-full whitespace-normal"
                      >
                        {badge}
                      </Badge>
                    ))}
                  </span>
                )}
                {option.disabledReason === undefined ? null : (
                  <span id={`${optionId}-reason`} className="text-sm text-muted-foreground">
                    {option.disabledReason}
                  </span>
                )}
              </span>
            </label>
          )
        })}
      </RadioGroup>
    </div>
  )
}
