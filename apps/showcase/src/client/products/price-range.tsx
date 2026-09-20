"use client"

import { Input } from "@plainworks/elements/input"
import { Label } from "@plainworks/elements/label"
import type { ListFilter } from "@plainworks/std"
import { type ReactElement, useId } from "react"

/** Props for {@link PriceRange}. Controlled through the shared catalog filter set. */
export interface PriceRangeProps {
  /** The current filter set (the catalog's `filters`). */
  readonly value: readonly ListFilter[]
  /** Called with the next filter set whenever a bound changes. */
  readonly onChange: (next: readonly ListFilter[]) => void
}

/** The numeric bound currently set for `price` under `op`, or an empty string when unset. */
function bound(filters: readonly ListFilter[], op: "gte" | "lte"): string {
  const filter = filters.find((candidate) => candidate.field === "price" && candidate.op === op)
  return filter !== undefined && "value" in filter ? String(filter.value) : ""
}

/**
 * A min/max price control that emits scalar `gte`/`lte` filters on the `price` field into the
 * shared catalog filter set, alongside the faceted `in` filters. An empty bound drops that side of
 * the range; clearing both removes the price constraint entirely.
 */
export function PriceRange({ value, onChange }: PriceRangeProps): ReactElement {
  const minId = useId()
  const maxId = useId()

  const setBound = (op: "gte" | "lte", raw: string): void => {
    const withoutBound = value.filter((filter) => !(filter.field === "price" && filter.op === op))
    const trimmed = raw.trim()
    if (trimmed === "") {
      onChange(withoutBound)
      return
    }
    const amount = Number(trimmed)
    if (!Number.isFinite(amount) || amount < 0) {
      return
    }
    onChange([...withoutBound, { field: "price", op, value: amount }])
  }

  return (
    <fieldset className="grid content-start gap-2">
      <legend className="mb-1 font-medium text-sm">Price</legend>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <Label htmlFor={minId} className="text-muted-foreground text-xs">
            Min
          </Label>
          <Input
            id={minId}
            type="number"
            inputMode="numeric"
            min={0}
            value={bound(value, "gte")}
            onChange={(event) => setBound("gte", event.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={maxId} className="text-muted-foreground text-xs">
            Max
          </Label>
          <Input
            id={maxId}
            type="number"
            inputMode="numeric"
            min={0}
            value={bound(value, "lte")}
            onChange={(event) => setBound("lte", event.target.value)}
          />
        </div>
      </div>
    </fieldset>
  )
}
