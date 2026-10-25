"use client"

import { cn } from "@plainworks/theme"
import type { ReactElement } from "react"

/** Every user-facing string of a {@link MetricValue}. */
export interface MetricValueLabels {
  /** For a value nobody measured, such as a metric the run did not record. */
  readonly notMeasured: string
  /** For a value that exists but is not known yet. */
  readonly unknown: string
}

/** English defaults for every {@link MetricValueLabels} field. */
export const defaultMetricValueLabels: MetricValueLabels = {
  notMeasured: "not measured",
  unknown: "unknown",
}

/** Props for {@link MetricValue}. */
export interface MetricValueProps {
  /** The measured value. `undefined`, `NaN` or an infinity is shown as missing, never as 0. */
  readonly value: number | undefined
  /** Why a missing value is missing. Defaults to `not-measured`. */
  readonly missing?: "not-measured" | "unknown"
  /** A short unit after the number, such as `ms` or `tok/s`. */
  readonly unit?: string
  /** BCP-47 locale, explicit so a server render and the client agree. */
  readonly locale: string
  /** `Intl.NumberFormat` options, such as `{ maximumFractionDigits: 2 }`. */
  readonly options?: Intl.NumberFormatOptions
  readonly labels?: Partial<MetricValueLabels>
  readonly className?: string
}

/**
 * A measured number in tabular figures with a smaller, muted unit. A missing value reads as words
 * ("not measured", "unknown"), so an absent measurement is never mistaken for zero.
 */
export function MetricValue({
  value,
  missing = "not-measured",
  unit,
  locale,
  options,
  labels,
  className,
}: MetricValueProps): ReactElement {
  if (value === undefined || !Number.isFinite(value)) {
    const copy = { ...defaultMetricValueLabels, ...labels }
    return (
      <span data-slot="metric-value" className={cn("text-muted-foreground", className)}>
        {missing === "unknown" ? copy.unknown : copy.notMeasured}
      </span>
    )
  }
  return (
    <span data-slot="metric-value" className={cn("font-semibold tabular-nums", className)}>
      {new Intl.NumberFormat(locale, options).format(value)}
      {unit === undefined ? null : (
        <>
          {" "}
          <span data-slot="metric-unit" className="text-[0.85em] font-normal text-muted-foreground">
            {unit}
          </span>
        </>
      )}
    </span>
  )
}
