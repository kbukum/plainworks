"use client"

import { Button } from "@plainworks/elements/button"
import { Input } from "@plainworks/elements/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plainworks/elements/select"
import { type ReactElement, useMemo, useState } from "react"
import { type Severity, sourceKey } from "../../protocol"
import type { DevtoolsClientPort } from "../../session"
import { type DevtoolsStore, type DevtoolsStoreState, filterEvents } from "../../store"
import { EventList } from "./event-list"

/** Props for {@link TimelineView}. */
export interface TimelineViewProps {
  /** Current store state (sources, events, dropped counts, pause flag). */
  readonly state: DevtoolsStoreState
  /** The store, for pause/resume/clear presentation policies. */
  readonly store: DevtoolsStore
  /** Port for on-demand detail. */
  readonly port: DevtoolsClientPort
}

const ALL_SOURCES = "__all__"
const ALL_SEVERITIES = "__all__"
const SEVERITIES: readonly Severity[] = ["ok", "info", "warn", "error"]

/**
 * The unified timeline: every retained event across sources, filterable by source, severity, and
 * kind. Pausing freezes presentation without letting collection grow (the session keeps its own
 * bounded retention; resuming rehydrates from it), and clearing empties the visible history while
 * the host's dropped-count signal stays truthful.
 */
export function TimelineView({ state, store, port }: TimelineViewProps): ReactElement {
  const [sourceFilter, setSourceFilter] = useState(ALL_SOURCES)
  const [severityFilter, setSeverityFilter] = useState(ALL_SEVERITIES)
  const [kindFilter, setKindFilter] = useState("")

  const selectedSource = state.sources.find((source) => sourceKey(source.id) === sourceFilter)?.id
  const filtered = filterEvents(state.events, {
    ...(selectedSource === undefined ? {} : { source: selectedSource }),
    ...(severityFilter === ALL_SEVERITIES ? {} : { severity: severityFilter as Severity }),
    ...(kindFilter === "" ? {} : { kind: kindFilter }),
  })
  const emptyLabel = useMemo(
    () => (state.events.length === 0 ? "No events recorded yet" : "No events match the filters"),
    [state.events.length],
  )

  return (
    <section aria-label="Timeline" className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={sourceFilter}
          onValueChange={(value) => {
            if (value !== null) setSourceFilter(value)
          }}
          items={[
            { value: ALL_SOURCES, label: "All sources" },
            ...state.sources.map((source) => ({
              value: sourceKey(source.id),
              label: source.label,
            })),
          ]}
        >
          <SelectTrigger aria-label="Source" size="sm" className="min-w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SOURCES}>All sources</SelectItem>
            {state.sources.map((source) => (
              <SelectItem key={sourceKey(source.id)} value={sourceKey(source.id)}>
                {source.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={severityFilter}
          onValueChange={(value) => {
            if (value !== null) setSeverityFilter(value)
          }}
        >
          <SelectTrigger aria-label="Severity" size="sm" className="min-w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SEVERITIES}>All severities</SelectItem>
            {SEVERITIES.map((severity) => (
              <SelectItem key={severity} value={severity}>
                {severity}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="search"
          aria-label="Kind"
          placeholder="Filter by kind"
          value={kindFilter}
          onChange={(event) => setKindFilter(event.currentTarget.value)}
          className="@max-sm:basis-full h-8 min-w-32 flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => (state.paused ? store.resume() : store.pause())}
        >
          {state.paused ? "Resume" : "Pause"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={state.events.length === 0}
          onClick={() => store.clear()}
        >
          Clear
        </Button>
      </div>
      <p role="status" className="text-muted-foreground text-xs">
        {timelineStatus(state, filtered.length)}
      </p>
      <EventList entries={filtered} sources={state.sources} port={port} emptyLabel={emptyLabel} />
    </section>
  )
}

function timelineStatus(state: DevtoolsStoreState, visible: number): string {
  const parts = [
    visible === state.events.length
      ? `${state.events.length} event${state.events.length === 1 ? "" : "s"}`
      : `${visible} of ${state.events.length} events`,
  ]
  if (state.droppedAggregate > 0) {
    parts.push(`${state.droppedAggregate} dropped (retention is bounded)`)
  }
  if (state.paused) parts.push("paused")
  return parts.join(" · ")
}
