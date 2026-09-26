"use client"

import type { ErrorSnapshot } from "@plainworks/std"
import { cn } from "@plainworks/theme"
import type { ReactElement } from "react"
import type { Severity, SourceDescriptor } from "../../protocol"
import type { IndicatorEntry } from "../../session/client-port"
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
  /** Injected clock for staleness; the shell passes its own so every view agrees. */
  readonly now: () => number
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
 * nothing to say. Every entry is a button that opens the relevant inspector view. It lays out
 * inline, so the shell's docked bar decides where it sits.
 */
export function DiagnosticsRail({
  sources,
  failures,
  indicators,
  droppedAggregate,
  now,
  staleAfterMs,
  tickMs = 1_000,
  maxVisible = 4,
  onOpen,
}: DiagnosticsRailProps): ReactElement | null {
  const current = useNow(now, tickMs)
  const entries = buildRailEntries({
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
    <div className="@container/rail flex min-w-0 flex-1 items-center gap-1">
      <ul
        aria-label="Diagnostics"
        className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto"
      >
        {visible.map((entry) => (
          <li key={entry.key} className="shrink-0">
            <button
              type="button"
              data-severity={entry.severity}
              data-stale={entry.stale || undefined}
              aria-label={
                entry.stale
                  ? `${entry.label}: ${entry.value} (stale)`
                  : `${entry.label}: ${entry.value}`
              }
              onClick={() => onOpen(entry.target)}
              className={cn(
                "inline-flex min-h-7 items-center gap-1.5 rounded-md px-2 text-xs",
                "hover:bg-muted @max-md/rail:gap-1 @max-md/rail:px-1.5",
                SEVERITY_STYLES[entry.severity],
              )}
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
            </button>
          </li>
        ))}
      </ul>
      {overflowCount === 0 ? null : (
        <button
          type="button"
          onClick={() => onOpen(undefined)}
          className="inline-flex min-h-7 shrink-0 items-center rounded-md px-2 text-muted-foreground text-xs hover:bg-muted"
        >
          {`Show ${overflowCount} more diagnostic${overflowCount === 1 ? "" : "s"}`}
        </button>
      )}
    </div>
  )
}
