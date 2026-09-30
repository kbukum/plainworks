"use client"

import type { RevenueChartData } from "@plainworks/demo"
import { DateValue } from "@plainworks/ui/display/date-value"
import { NumberValue } from "@plainworks/ui/display/number-value"
import { Sparkline } from "@plainworks/ui/display/sparkline"
import type { ReactElement } from "react"
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from "../../neutral/constants"
import { GrowthBadge } from "./growth-badge"

const CURRENCY = { style: "currency", currency: "USD", maximumFractionDigits: 0 } as const

/** The smallest 1, 2, 2.5, 5, or 10 multiple of a power of ten at or above `value`. */
function niceStep(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const fraction = value / magnitude
  const nice =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10
  return nice * magnitude
}

/**
 * Three value-axis ticks from zero: the baseline, a midpoint, and a rounded top at or above `max`.
 * Starting at zero keeps the line's height honest about the amount.
 */
export function revenueTicks(max: number): readonly [number, number, number] {
  const step = max > 0 ? niceStep(max / 2) : 1
  return [0, step, step * 2]
}

/** Props for {@link TrendVisual}. */
export interface TrendVisualProps {
  /** The validated revenue series plus its summary total and growth. */
  readonly revenue: RevenueChartData
}

/**
 * An accessible revenue chart: the kit `Sparkline` against a zero baseline with labelled value
 * gridlines and the first and last day under it. The drawing and its axis labels are hidden from
 * assistive tech; the data is exposed as a visually hidden table instead, and the summary states
 * the total and signed change in words, so nothing rests on color or shape alone. It draws
 * statically, so there is no motion to reconcile with `prefers-reduced-motion`.
 */
export function TrendVisual({ revenue }: TrendVisualProps): ReactElement {
  const values = revenue.data.map((point) => point.value)
  const ticks = revenueTicks(Math.max(0, ...values))
  const firstPoint = revenue.data[0]
  const lastPoint = revenue.data.at(-1)

  return (
    <figure className="grid gap-4">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-2xl font-semibold">
          <NumberValue value={revenue.total} locale={DISPLAY_LOCALE} options={CURRENCY} />
        </span>
        <GrowthBadge value={revenue.growth} periodLabel="over the period" />
      </figcaption>

      <div
        aria-hidden
        className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-caption text-muted-foreground"
      >
        <div
          data-testid="trend-value-axis"
          className="flex h-40 flex-col-reverse justify-between text-end tabular-nums"
        >
          {ticks.map((tick) => (
            <span key={tick} className="-my-2 leading-4">
              <NumberValue value={tick} locale={DISPLAY_LOCALE} options={CURRENCY} />
            </span>
          ))}
        </div>
        <Sparkline values={values} max={ticks[2]} gridlines={ticks} className="h-40" />
        {firstPoint === undefined || lastPoint === undefined ? null : (
          <div data-testid="trend-time-axis" className="col-start-2 flex justify-between pt-1">
            <DateValue
              value={firstPoint.date}
              locale={DISPLAY_LOCALE}
              timeZone={DISPLAY_TIME_ZONE}
            />
            {lastPoint === firstPoint ? null : (
              <DateValue
                value={lastPoint.date}
                locale={DISPLAY_LOCALE}
                timeZone={DISPLAY_TIME_ZONE}
              />
            )}
          </div>
        )}
      </div>

      <table className="sr-only">
        <caption>Revenue by day over the period</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {revenue.data.map((point) => (
            <tr key={point.date}>
              <td>
                <DateValue
                  value={point.date}
                  locale={DISPLAY_LOCALE}
                  timeZone={DISPLAY_TIME_ZONE}
                />
              </td>
              <td>
                <NumberValue value={point.value} locale={DISPLAY_LOCALE} options={CURRENCY} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
