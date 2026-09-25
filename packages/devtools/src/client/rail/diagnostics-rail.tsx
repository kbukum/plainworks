"use client"

import type { ErrorSnapshot } from "@plainworks/std"
import { cn } from "@plainworks/theme"
import { type ReactElement, useEffect } from "react"
import type { Severity, SourceDescriptor } from "../../protocol"
import type { IndicatorEntry } from "../../session/client-port"
import { useNow } from "../shell/use-now"
import { reserveBodyPadding } from "./body-reservation"
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

const SEVERITY_STYLES: Readonly<Record<Severity, string>> = {
  error: "text-destructive",
  warn: "text-amber-700 dark:text-amber-400",
  info: "text-foreground",
  ok: "text-muted-foreground",
}

/**
 * The compact ambient rail: a prioritized, glanceable strip of the same session signals the full
 * inspector renders — never a second telemetry path. It leads with failures and abnormal values,
 * fades stale ones, collapses overflow behind an explicit count, and stays quiet when there is
 * nothing to say. Every row is a button that opens the relevant inspector view.
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

  const hasEntries = entries.length > 0

  useEffect(() => {
    if (!hasEntries) return
    // A shared, reference-counted reservation so concurrent rails never clobber the body padding.
    return reserveBodyPadding(36)
  }, [hasEntries])

  if (!hasEntries) return null

  return (
    <section
      aria-label="Diagnostics"
      className={cn(
        "@container fixed inset-x-0 bottom-0 z-40 flex items-center gap-1 overflow-x-auto",
        "border-t bg-popover/95 px-2 py-1 text-xs backdrop-blur motion-reduce:transition-none",
      )}
    >
      {visible.map((entry) => (
        <button
          key={entry.key}
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
            "inline-flex min-h-6 shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5",
            "hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
            "@max-md:gap-1 @max-md:px-1.5",
            SEVERITY_STYLES[entry.severity],
          )}
        >
          <span
            aria-hidden
            data-stale={entry.stale || undefined}
            className={cn(
              "size-1.5 rounded-full bg-current data-stale:opacity-40",
              entry.severity === "ok" && "bg-emerald-500",
            )}
          />
          {/* Container-adaptive: at narrow rail widths the label yields to the value, which is
              the glanceable signal; the full name stays in the accessible label. */}
          <span className="@max-md:hidden font-medium">{entry.label}</span>
          <span className="tabular-nums">{entry.value}</span>
        </button>
      ))}
      {overflowCount === 0 ? null : (
        <button
          type="button"
          onClick={() => onOpen(undefined)}
          className={cn(
            "inline-flex min-h-6 shrink-0 items-center rounded-md px-2 py-0.5 text-muted-foreground",
            "hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
          )}
        >
          {`Show ${overflowCount} more diagnostic${overflowCount === 1 ? "" : "s"}`}
        </button>
      )}
    </section>
  )
}
