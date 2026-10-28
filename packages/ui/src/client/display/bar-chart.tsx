"use client"

import { cn } from "@plainworks/theme"
import type { SeriesColor } from "@plainworks/theme/tokens"
import type { ReactElement } from "react"
import { markerFor } from "./item-marker"

/** One measured attribute: a value per series, in series order. `null` is unavailable and draws no bar. */
export interface BarGroup {
  readonly label: string
  readonly values: readonly (number | null)[]
  /** The top of this group's scale, which starts at zero. Defaults to the group's largest value. */
  readonly max?: number | undefined
  /** Formats this group's values; defaults to the chart's formatter. */
  readonly format?: ((value: number) => string) | undefined
}

/** Props for {@link GroupedBarChart}. */
export interface GroupedBarChartProps {
  /** The series names, in order; series `i` wears the marker for index `i`. */
  readonly series: readonly string[]
  readonly groups: readonly BarGroup[]
  /** Formats values in labels and the summary. Defaults to two decimals. */
  readonly format?: ((value: number) => string) | undefined
  /** Replaces the generated text summary shown under the chart. */
  readonly summary?: string | undefined
  readonly className?: string | undefined
}

const HEIGHT = 40
const SLOT = 10
const BAR = 7

// Literal class names, so Tailwind finds every one.
const FILL = {
  "series-1": "fill-series-1",
  "series-2": "fill-series-2",
  "series-3": "fill-series-3",
  "series-4": "fill-series-4",
  "series-5": "fill-series-5",
  "series-6": "fill-series-6",
  "series-7": "fill-series-7",
  "series-8": "fill-series-8",
} as const satisfies Record<SeriesColor, string>

function defaultFormat(value: number): string {
  return value.toFixed(2)
}

/** The bar height for `value` on a zero-to-`top` scale in the chart's 40-unit view box; values outside clamp to its edges. */
export function barHeight(value: number, top: number): number {
  if (!(top > 0) || !Number.isFinite(value)) return 0
  return Math.round(Math.min(1, Math.max(0, value / top)) * HEIGHT * 100) / 100
}

/**
 * The chart's text summary: per group, each series' marker letter, name and value, with "not
 * available" for a missing value. It carries every number the bars show, so no meaning rests on the
 * drawing.
 */
export function barChartSummary(
  series: readonly string[],
  groups: readonly BarGroup[],
  format: (value: number) => string = defaultFormat,
): string {
  return groups
    .map((group) => {
      const fmt = group.format ?? format
      const parts = series.map((name, i) => {
        const value = group.values[i]
        const shown = value === null || value === undefined ? "not available" : fmt(value)
        return `${markerFor(i).letter} ${name} ${shown}`
      })
      return `${group.label}: ${parts.join(", ")}.`
    })
    .join(" ")
}

/**
 * A small grouped bar chart: one group per attribute, one bar per series in the series' marker
 * color. Each bar is labelled with its marker letter and value, so neither color nor hover carries
 * meaning, and the chart ends with a text summary of every value. Keep a table next to it as the
 * full source.
 */
export function GroupedBarChart({
  series,
  groups,
  format = defaultFormat,
  summary,
  className,
}: GroupedBarChartProps): ReactElement {
  return (
    <figure data-slot="grouped-bar-chart" className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div aria-hidden="true" className="flex items-end gap-4 overflow-x-auto pb-1">
        {groups.map((group) => {
          const finite = group.values.filter((v): v is number => v !== null && Number.isFinite(v))
          const top = group.max ?? Math.max(0, ...finite)
          const fmt = group.format ?? format
          return (
            <div
              key={group.label}
              data-slot="bar-group"
              className="flex shrink-0 flex-col items-stretch gap-1"
            >
              {/* One column per series, as wide as its label, so values never run together. */}
              <div
                className="grid gap-x-2 text-center text-caption tabular-nums"
                style={{
                  gridTemplateColumns: `repeat(${series.length}, minmax(2rem, max-content))`,
                }}
              >
                {series.map((name, i) => {
                  const value = group.values[i]
                  const missing = value === null || value === undefined
                  return (
                    <span key={name} data-slot="bar" className="flex flex-col">
                      <svg
                        aria-hidden="true"
                        viewBox={`0 0 ${SLOT} ${HEIGHT}`}
                        preserveAspectRatio="none"
                        focusable="false"
                        className="h-16 w-full border-b border-border"
                      >
                        {missing ? null : (
                          <rect
                            data-series={markerFor(i).color}
                            x={(SLOT - BAR) / 2}
                            y={HEIGHT - barHeight(value, top)}
                            width={BAR}
                            height={barHeight(value, top)}
                            rx={1}
                            className={FILL[markerFor(i).color]}
                          />
                        )}
                      </svg>
                      <span className="font-semibold">{markerFor(i).letter}</span>
                      <span className="text-muted-foreground">{missing ? "—" : fmt(value)}</span>
                    </span>
                  )
                })}
              </div>
              <span className="text-center text-caption text-muted-foreground">{group.label}</span>
            </div>
          )
        })}
      </div>
      <figcaption className="text-caption text-muted-foreground">
        {summary ?? barChartSummary(series, groups, format)}
      </figcaption>
    </figure>
  )
}
