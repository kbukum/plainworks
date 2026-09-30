import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@plainworks/elements/card"
import { cn } from "@plainworks/theme"
import type { ReactElement, ReactNode } from "react"

/** Props for {@link MetricCard}. */
export interface MetricCardProps {
  /** What is measured, e.g. `"Revenue"`. */
  readonly label: ReactNode
  /** The headline value; leave it out while it loads or when it is unavailable. */
  readonly value?: ReactNode
  /** A supporting line under the value: a trend badge, a caption, or a loading placeholder. */
  readonly detail?: ReactNode
  readonly className?: string | undefined
}

/** One headline number with its label and an optional supporting line. */
export function MetricCard({ label, value, detail, className }: MetricCardProps): ReactElement {
  return (
    <Card data-slot="metric-card" className={className}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        {value === undefined ? null : (
          <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
        )}
      </CardHeader>
      {detail === undefined ? null : (
        <CardContent className="text-caption text-muted-foreground">{detail}</CardContent>
      )}
    </Card>
  )
}

/** Props for {@link MetricList}. */
export interface MetricListProps {
  /** {@link MetricCard}s, in reading order. */
  readonly children: ReactNode
  readonly className?: string | undefined
}

/**
 * A fluid grid of {@link MetricCard}s: one column on a narrow container, two with room, and four on
 * a wide one. It follows its container, not the viewport, so it fits a sidebar as well as a page.
 */
export function MetricList({ children, className }: MetricListProps): ReactElement {
  return (
    <div data-slot="metric-list" className="@container/metric-list">
      <div
        className={cn(
          "grid grid-cols-1 gap-4 @sm/metric-list:grid-cols-2 @4xl/metric-list:grid-cols-4",
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}
