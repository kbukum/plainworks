"use client"

import type { RevenueChartData } from "@plainworks/demo"
import { DateValue, NumberValue } from "@plainworks/ui/display"
import type { ReactElement } from "react"
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from "../../app/constants"
import { GrowthBadge } from "./growth-badge"

const VIEW_WIDTH = 100
const VIEW_HEIGHT = 30

/** Project the series onto the SVG viewBox, flattening a constant series to the mid-line. */
function toPolyline(points: readonly number[]): string {
  if (points.length === 0) {
    return ""
  }
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min
  const step = points.length > 1 ? VIEW_WIDTH / (points.length - 1) : 0
  return points
    .map((value, index) => {
      const x = index * step
      const y = span === 0 ? VIEW_HEIGHT / 2 : VIEW_HEIGHT - ((value - min) / span) * VIEW_HEIGHT
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(" ")
}

/** Props for {@link TrendVisual}. */
export interface TrendVisualProps {
  /** The validated revenue series plus its summary total and growth. */
  readonly revenue: RevenueChartData
}

/**
 * An accessible revenue sparkline. The line is a decorative SVG (`aria-hidden`) — the data itself
 * is exposed to assistive tech as a visually-hidden table, and the visible summary states the total
 * and signed growth so the trend never rests on color alone. It draws statically, so there is no
 * motion to reconcile with `prefers-reduced-motion`.
 */
export function TrendVisual({ revenue }: TrendVisualProps): ReactElement {
  const polyline = toPolyline(revenue.data.map((point) => point.value))
  const firstPoint = revenue.data[0]
  const lastPoint = revenue.data.at(-1)

  return (
    <figure className="grid gap-3">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-2xl font-semibold">
          <NumberValue
            value={revenue.total}
            locale={DISPLAY_LOCALE}
            options={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }}
          />
        </span>
        <GrowthBadge value={revenue.growth} periodLabel="over the period" />
      </figcaption>

      {firstPoint === undefined || lastPoint === undefined ? null : (
        <p className="text-muted-foreground text-sm">
          <DateValue value={firstPoint.date} locale={DISPLAY_LOCALE} timeZone={DISPLAY_TIME_ZONE} />{" "}
          –{" "}
          <DateValue value={lastPoint.date} locale={DISPLAY_LOCALE} timeZone={DISPLAY_TIME_ZONE} />
        </p>
      )}

      <svg
        aria-hidden
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-24 w-full text-primary"
      >
        <polyline
          points={polyline}
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {revenue.data.map((point, index) => {
          const coordinate = polyline.split(" ")[index]?.split(",")
          return coordinate === undefined ? null : (
            <circle
              key={point.date}
              cx={coordinate[0]}
              cy={coordinate[1]}
              r="0.8"
              fill="currentColor"
            />
          )
        })}
      </svg>

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
                <NumberValue
                  value={point.value}
                  locale={DISPLAY_LOCALE}
                  options={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
