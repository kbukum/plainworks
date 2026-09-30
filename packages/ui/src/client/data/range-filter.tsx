"use client"

import { Label } from "@plainworks/elements/label"
import { NumberField, NumberFieldGroup, NumberFieldInput } from "@plainworks/elements/number-field"
import type { ListFilter } from "@plainworks/std/list"
import { type ReactElement, useId } from "react"
import { type RangeBoundOperator, rangeBound, withRangeBound } from "./filter-model"

/** Every user-facing string of the {@link RangeFilter}. */
export interface RangeFilterLabels {
  /** Names the group, e.g. "Price". */
  readonly legend: string
  readonly min: string
  readonly max: string
}

/** English defaults for every {@link RangeFilterLabels} field. */
export const defaultRangeFilterLabels: RangeFilterLabels = {
  legend: "Range",
  min: "Min",
  max: "Max",
}

/** Props for {@link RangeFilter}. Controlled through the list's filter set. */
export interface RangeFilterProps {
  /** The numeric field the range filters on. */
  readonly field: string
  /** The list's current filter set. */
  readonly value: readonly ListFilter[]
  /** Called with the next filter set whenever a bound changes. */
  readonly onChange: (next: readonly ListFilter[]) => void
  readonly labels?: Partial<RangeFilterLabels>
  /** The lowest bound either side accepts. Defaults to `0`. */
  readonly min?: number
}

/**
 * A min/max control for one numeric field. It writes `gte` and `lte` filters into the list's filter
 * set, next to any other filters. Clearing a side removes that bound.
 */
export function RangeFilter({
  field,
  value,
  onChange,
  labels,
  min = 0,
}: RangeFilterProps): ReactElement {
  const copy = { ...defaultRangeFilterLabels, ...labels }
  const minId = useId()
  const maxId = useId()

  const bound = (op: RangeBoundOperator, id: string, label: string): ReactElement => (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-muted-foreground text-xs">
        {label}
      </Label>
      <NumberField
        id={id}
        min={min}
        value={rangeBound(value, field, op)}
        onValueChange={(next) => onChange(withRangeBound(value, field, op, next))}
      >
        <NumberFieldGroup>
          <NumberFieldInput />
        </NumberFieldGroup>
      </NumberField>
    </div>
  )

  return (
    <fieldset className="grid content-start gap-2">
      <legend className="mb-1 font-medium text-sm">{copy.legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        {bound("gte", minId, copy.min)}
        {bound("lte", maxId, copy.max)}
      </div>
    </fieldset>
  )
}
