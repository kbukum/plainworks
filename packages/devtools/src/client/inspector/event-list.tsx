"use client"

import { Badge } from "@plainworks/elements/badge"
import { Button } from "@plainworks/elements/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@plainworks/elements/collapsible"
import { EmptyState } from "@plainworks/ui/feedback/empty-state"
import { type ReactElement, useState } from "react"
import { type Severity, type SourceDescriptor, sourceKey } from "../../protocol"
import type { RetentionEntry } from "../../retention"
import type { DevtoolsClientPort } from "../../session"
import { useDevtoolsLabels } from "../labels"
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
 * Detail is fetched on demand for the selected row only — one row's detail is disclosed at a time —
 * and rows are identified by source key +
 * sequence so updates never reshuffle identity.
 */
export function EventList({ entries, sources, port, emptyLabel }: EventListProps): ReactElement {
  const labels = useDevtoolsLabels()
  const [selected, setSelected] = useState<string>()
  const newestFirst = [...entries].reverse()
  const sourceLabels = new Map(sources.map((source) => [sourceKey(source.id), source.label]))

  if (newestFirst.length === 0) {
    return <EmptyState title={emptyLabel} className="p-6" />
  }

  return (
    <ul aria-label={labels.events} className="grid divide-y divide-border">
      {newestFirst.map((entry) => {
        const key = `${sourceKey(entry.id)}:${entry.seq}`
        const isSelected = selected === key
        return (
          <Collapsible
            key={key}
            render={<li />}
            open={isSelected}
            onOpenChange={(open) => setSelected(open ? key : undefined)}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1 py-2"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <time
                dateTime={new Date(entry.event.at).toISOString()}
                className="tabular-nums text-muted-foreground"
              >
                {formatEventTime(entry.event.at)}
              </time>
              <Badge variant={SEVERITY_VARIANT[entry.event.severity]}>
                {labels.severity(entry.event.severity)}
              </Badge>
              <span className="min-w-0 truncate text-muted-foreground">
                {sourceLabels.get(sourceKey(entry.id)) ?? entry.id.kind}
              </span>
              <span className="min-w-0 truncate rounded bg-muted px-1 py-0.5 font-mono text-caption">
                {entry.event.kind}
              </span>
            </div>
            {entry.event.detail === undefined ? null : (
              <CollapsibleTrigger
                aria-label={labels.eventDetails(entry.event.label)}
                render={<Button variant="ghost" size="xs" className="text-primary" />}
              >
                {labels.details}
              </CollapsibleTrigger>
            )}
            <p className="col-span-2 wrap-anywhere font-mono text-xs">{entry.event.label}</p>
            {entry.event.detail === undefined ? null : (
              <CollapsibleContent className="col-span-2 min-w-0">
                <DetailPanel port={port} source={entry.id} detailRef={entry.event.detail} />
              </CollapsibleContent>
            )}
          </Collapsible>
        )
      })}
    </ul>
  )
}

/** UTC `HH:MM:SS.mmm` — locale-independent so timelines read identically on every machine. */
function formatEventTime(at: number): string {
  return new Date(at).toISOString().slice(11, 23)
}
