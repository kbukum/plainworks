"use client"

import { ToggleGroup, ToggleGroupItem } from "@plainworks/elements/toggle-group"
import type { ReactElement } from "react"

interface DateRange {
  readonly days: number
  readonly label: string
}

const DATE_RANGES: readonly DateRange[] = [
  { days: 7, label: "Last 7 days" },
  { days: 14, label: "Last 14 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
]

/** Props for {@link DateRangeControl}. */
export interface DateRangeControlProps {
  readonly days: number
  readonly onChange: (days: number) => void
}

/** A single-select, keyboard-operable range control for the dashboard trend. */
export function DateRangeControl({ days, onChange }: DateRangeControlProps): ReactElement {
  return (
    <ToggleGroup
      aria-label="Revenue date range"
      variant="outline"
      size="sm"
      value={[String(days)]}
      onValueChange={(values) => {
        const selected = DATE_RANGES.find((range) => String(range.days) === values[0])
        if (selected !== undefined) {
          onChange(selected.days)
        }
      }}
      className="max-w-full flex-wrap"
    >
      {DATE_RANGES.map((range) => (
        <ToggleGroupItem key={range.days} value={String(range.days)}>
          {range.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
