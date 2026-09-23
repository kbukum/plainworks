"use client"

import { Badge } from "@plainworks/elements/badge"
import { type ReactElement, useState } from "react"
import { type Severity, type SourceDescriptor, sourceKey } from "../../protocol"
import type { RetentionEntry } from "../../retention"
import type { DevtoolsClientPort } from "../../session"
import { DetailPanel } from "./detail-panel"

/** Props for {@link EventList}. */
export interface EventListProps {
  /** Entries to render, oldest first; the list displays newest first. */
  readonly entries: readonly RetentionEntry[]
  /** Discovered sources, used to label rows with the source's human label. */
  readonly sources: readonly SourceDescriptor[]
  /** Port used to resolve detail on demand. */
  readonly port: DevtoolsClientPort
  /** Text shown when `entries` is empty; names the reason (filter, none recorded). */
  readonly emptyLabel: string
}

const SEVERITY_VARIANT: Readonly<Record<Severity, "destructive" | "secondary" | "outline">> = {
  error: "destructive",
  warn: "secondary",
  info: "outline",
  ok: "outline",
}

/**
 * A bounded, newest-first timeline of retained events. The list is bounded by the session's
 * retention, so every retained row renders — there is nothing to virtualize beyond the cap.
 * Detail is fetched on demand for the selected row only, and rows are identified by source key +
 * sequence so updates never reshuffle identity.
 */
export function EventList({ entries, sources, port, emptyLabel }: EventListProps): ReactElement {
  const [selected, setSelected] = useState<string>()
  const newestFirst = [...entries].reverse()
  const labels = new Map(sources.map((source) => [sourceKey(source.id), source.label]))

  if (newestFirst.length === 0) {
    return <p className="py-4 text-center text-muted-foreground text-xs">{emptyLabel}</p>
  }

  return (
    <ul aria-label="Events" className="grid divide-y divide-border/60">
      {newestFirst.map((entry) => {
        const key = `${sourceKey(entry.id)}:${entry.seq}`
        const isSelected = selected === key
        return (
          <li key={key} className="grid gap-1 py-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <time
                dateTime={new Date(entry.event.at).toISOString()}
                className="tabular-nums text-muted-foreground"
              >
                {formatEventTime(entry.event.at)}
              </time>
              <Badge variant={SEVERITY_VARIANT[entry.event.severity]}>{entry.event.severity}</Badge>
              <span className="text-muted-foreground">
                {labels.get(sourceKey(entry.id)) ?? entry.id.kind}
              </span>
              <span className="rounded bg-muted px-1 py-0.5 font-mono text-[0.6875rem]">
                {entry.event.kind}
              </span>
              <span className="min-w-0 flex-1 break-words">{entry.event.label}</span>
              {entry.event.detail === undefined ? null : (
                <button
                  type="button"
                  aria-expanded={isSelected}
                  aria-label={`Details for ${entry.event.label}`}
                  onClick={() => setSelected(isSelected ? undefined : key)}
                  className="min-h-6 rounded-md px-2 text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                >
                  Details
                </button>
              )}
            </div>
            {isSelected && entry.event.detail !== undefined ? (
              <DetailPanel port={port} source={entry.id} detailRef={entry.event.detail} />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/** UTC `HH:MM:SS.mmm` — locale-independent so timelines read identically on every machine. */
function formatEventTime(at: number): string {
  return new Date(at).toISOString().slice(11, 23)
}
