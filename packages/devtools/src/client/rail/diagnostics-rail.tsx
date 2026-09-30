"use client"

import { Button } from "@plainworks/elements/button"
import type { ErrorSnapshot } from "@plainworks/std"
import type { Clock } from "@plainworks/std/time"
import { cn } from "@plainworks/theme"
import type { ReactElement } from "react"
import type { Severity, SourceDescriptor } from "../../protocol"
import type { IndicatorEntry } from "../../session/client-port"
import { useDevtoolsLabels } from "../labels"
import { useNow } from "../shell/use-now"
import { buildRailEntries, splitRailOverflow } from "./prioritize"

/** Props for {@link DiagnosticsRail}. */
export interface DiagnosticsRailProps {
  /** Discovered sources, used to label failure entries. */
  readonly sources: readonly SourceDescriptor[]
  /** Latest source failures, keyed by source key. */
  readonly failures: ReadonlyMap<string, ErrorSnapshot>
  /** Latest indicator values across sources. */
  readonly indicators: readonly IndicatorEntry[]
  /** Host-reported aggregate dropped-event count, surfaced as a warning entry when above zero. */
  readonly droppedAggregate: number
  /** Clock for staleness; the shell passes its own so every view agrees. */
  readonly clock: Clock
  /** Age in milliseconds after which an indicator reads as stale. */
  readonly staleAfterMs: number
  /** Freshness re-poll cadence in milliseconds; `0` freezes the clock (tests). Defaults to 1000. */
  readonly tickMs?: number
  /** Rows shown before the rest collapse behind the overflow disclosure. Defaults to 4. */
  readonly maxVisible?: number
  /** Open the full inspector, optionally at a target view. */
  readonly onOpen: (target?: string) => void
}

// Semantic theme tokens only, so the rail follows the host's mode, scheme, and contrast choice.
const SEVERITY_STYLES: Readonly<Record<Severity, string>> = {
  error: "text-destructive",
  warn: "text-warning",
  info: "text-foreground",
  ok: "text-muted-foreground",
}

// The bar turns vertical on a side dock, so the rail's buttons size to their content in both axes
// instead of the atom's fixed block size, and keep a 28px minimum target either way.
const RAIL_BUTTON =
  "h-auto min-h-7 min-w-7 px-2 py-1 font-normal @max-md/rail:gap-1 @max-md/rail:px-1.5"

const DOT_STYLES: Readonly<Record<Severity, string>> = {
  error: "bg-destructive",
  warn: "bg-warning",
  info: "bg-info",
  ok: "bg-success",
}

/**
 * The compact ambient rail: a prioritized, glanceable list of the same session signals the full
 * inspector renders — never a second telemetry path. It leads with failures and abnormal values,
 * fades stale ones, collapses overflow behind an explicit count, and renders nothing when there is
 * nothing to say. Every entry is a button that opens the relevant inspector view. It lays out along
 * the inline axis, so it follows the writing mode of the bar it sits in: horizontal on a bottom
 * dock, vertical on a side dock.
 */
export function DiagnosticsRail({
  sources,
  failures,
  indicators,
  droppedAggregate,
  clock,
  staleAfterMs,
  tickMs = 1_000,
  maxVisible = 4,
  onOpen,
}: DiagnosticsRailProps): ReactElement | null {
  const labels = useDevtoolsLabels()
  const current = useNow(clock, tickMs)
  const entries = buildRailEntries({
    labels,
    sources,
    failures,
    indicators,
    droppedAggregate,
    now: current,
    staleAfterMs,
  })
  const { visible, overflowCount } = splitRailOverflow(entries, maxVisible)

  if (entries.length === 0) return null

  return (
    <div className="@container/rail flex min-h-0 min-w-0 flex-1 items-center gap-1">
      <ul
        aria-label={labels.diagnostics}
        className="no-scrollbar flex min-h-0 min-w-0 items-center gap-1 overflow-auto"
      >
        {visible.map((entry) => (
          <li key={entry.key} className="shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              data-severity={entry.severity}
              data-stale={entry.stale || undefined}
              aria-label={
                entry.stale
                  ? labels.staleRailEntry(entry.label, entry.value)
                  : labels.railEntry(entry.label, entry.value)
              }
              onClick={() => onOpen(entry.target)}
              className={cn(RAIL_BUTTON, "gap-1.5", SEVERITY_STYLES[entry.severity])}
            >
              {/* Staleness fades only the dot, so the value text keeps its full contrast. */}
              <span
                aria-hidden
                data-stale={entry.stale || undefined}
                className={cn(
                  "size-2 shrink-0 rounded-full data-stale:opacity-40",
                  DOT_STYLES[entry.severity],
                )}
              />
              {/* Container-adaptive: at narrow rail widths the label yields to the value, which
                  is the glanceable signal; the full name stays in the accessible label. */}
              <span className="font-medium @max-md/rail:hidden">{entry.label}</span>
              <span className="tabular-nums">{entry.value}</span>
            </Button>
          </li>
        ))}
      </ul>
      {overflowCount === 0 ? null : (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => onOpen(undefined)}
          className={cn(RAIL_BUTTON, "text-muted-foreground")}
        >
          {labels.showMore(overflowCount)}
        </Button>
      )}
    </div>
  )
}
