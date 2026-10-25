"use client"

import { cn } from "@plainworks/theme"
import { SERIES_COLORS, type SeriesColor } from "@plainworks/theme/tokens"
import type { ReactElement, ReactNode } from "react"

/** The label and color that tell one item apart from the others in a set. */
export interface Marker {
  /** `A`–`H`, then `A2`, `B2`… once the colors repeat. */
  readonly letter: string
  readonly color: SeriesColor
}

const LETTERS = "ABCDEFGH"

/**
 * The marker for the item at `index` (0-based) in a set: letters A–H with the eight series colors,
 * then the letters repeat with a round number (A2, B2…), so a label is never shared.
 */
export function markerFor(index: number): Marker {
  if (!Number.isInteger(index) || index < 0) throw new RangeError(`Invalid marker index ${index}`)
  const slot = index % SERIES_COLORS.length
  const round = Math.floor(index / SERIES_COLORS.length) + 1
  return {
    letter: `${LETTERS[slot]}${round === 1 ? "" : round}`,
    color: SERIES_COLORS[slot] as SeriesColor,
  }
}

// Literal class names, so Tailwind finds every one.
const FILL = {
  "series-1": "bg-series-1",
  "series-2": "bg-series-2",
  "series-3": "bg-series-3",
  "series-4": "bg-series-4",
  "series-5": "bg-series-5",
  "series-6": "bg-series-6",
  "series-7": "bg-series-7",
  "series-8": "bg-series-8",
} as const satisfies Record<SeriesColor, string>

/** Props for {@link ItemMarker}. */
export interface ItemMarkerProps {
  /** The item's 0-based place in its set; see {@link markerFor}. */
  readonly index: number
  /** The item's name, shown beside the badge. Leave it out only where the name is already next to it. */
  readonly children?: ReactNode
  readonly className?: string
}

/**
 * A letter badge in the item's series color, followed by its name. The letter and the name always
 * carry the identity, so color is never the only cue; the same index gives the same marker
 * everywhere the item appears.
 */
export function ItemMarker({ index, children, className }: ItemMarkerProps): ReactElement {
  const marker = markerFor(index)
  return (
    <span
      data-slot="item-marker"
      className={cn("inline-flex min-w-0 items-center gap-1.5", className)}
    >
      <span
        data-series={marker.color}
        className={cn(
          "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-sm px-1 text-caption font-semibold text-series-foreground tabular-nums forced-colors:border forced-colors:border-[CanvasText]",
          FILL[marker.color],
        )}
      >
        {marker.letter}
      </span>
      {children === undefined ? null : <span className="min-w-0 truncate">{children}</span>}
    </span>
  )
}
