import { cn } from "@plainworks/theme"
import type { ReactElement } from "react"

const WIDTH = 100
const HEIGHT = 30

/** One projected point in the sparkline's `0 0 100 30` view box. */
export interface SparklinePoint {
  readonly x: number
  readonly y: number
}

function clampRatio(value: number, top: number): number {
  if (!(top > 0)) return 0
  return Math.min(1, Math.max(0, value / top))
}

/**
 * Project a series onto the sparkline's view box against a zero-to-`top` scale. Values spread
 * evenly across the width; a single value sits in the middle. Values outside the scale clamp to its
 * edges.
 */
export function sparklinePoints(values: readonly number[], top: number): SparklinePoint[] {
  const step = values.length > 1 ? WIDTH / (values.length - 1) : 0
  return values.map((value, index) => ({
    x: values.length === 1 ? WIDTH / 2 : round(index * step),
    y: round(HEIGHT - clampRatio(value, top) * HEIGHT),
  }))
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/** Props for {@link Sparkline}. */
export interface SparklineProps {
  /** The series, in order. */
  readonly values: readonly number[]
  /**
   * Names the chart as an image. Leave it out when nearby text or a table already gives the data;
   * the drawing is then hidden from assistive tech.
   */
  readonly label?: string | undefined
  /** A line through the values, or one bar per value. Defaults to `line`. */
  readonly variant?: "line" | "bar"
  /** The top of the scale, which always starts at zero. Defaults to the largest value. */
  readonly max?: number | undefined
  /** Draw a faint horizontal line at each of these values. */
  readonly gridlines?: readonly number[] | undefined
  /** Size it here; it fills the box it is given. */
  readonly className?: string | undefined
}

/**
 * A small, dependency-free SVG chart that paints with the theme's accent and stretches to its box.
 * It draws once with no animation. Pair it with text that states the numbers, so no meaning rests
 * on the shape alone.
 */
export function Sparkline({
  values,
  label,
  variant = "line",
  max,
  gridlines = [],
  className,
}: SparklineProps): ReactElement {
  const top = max ?? Math.max(0, ...values)
  const points = sparklinePoints(values, top)
  const slot = WIDTH / Math.max(1, values.length)
  const barWidth = slot * 0.7

  return (
    <svg
      data-slot="sparkline"
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      focusable={label === undefined ? "false" : undefined}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={cn("h-12 w-full overflow-visible", className)}
    >
      {gridlines.map((value) => {
        const y = round(HEIGHT - clampRatio(value, top) * HEIGHT)
        return (
          <line
            key={value}
            x1={0}
            x2={WIDTH}
            y1={y}
            y2={y}
            className="stroke-border"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        )
      })}
      {variant === "bar" ? (
        points.map((point, index) => (
          <rect
            // The series is positional, so its index is its identity.
            key={index}
            x={round(index * slot + (slot - barWidth) / 2)}
            y={point.y}
            width={round(barWidth)}
            height={round(HEIGHT - point.y)}
            rx={1}
            className="fill-primary"
          />
        ))
      ) : (
        <polyline
          points={points.map((point) => `${point.x},${point.y}`).join(" ")}
          fill="none"
          className="stroke-primary"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  )
}
