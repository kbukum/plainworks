"use client"

import { Button } from "@plainworks/elements/button"
import { Input } from "@plainworks/elements/input"
import { NativeSelect, NativeSelectOption } from "@plainworks/elements/native-select"
import { Toolbar } from "@plainworks/ui/page"
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
const SEVERITY_LABELS: Readonly<Record<Severity, string>> = {
  ok: "OK",
  info: "Info",
  warn: "Warning",
  error: "Error",
}
const SEVERITIES: readonly Severity[] = ["ok", "info", "warn", "error"]

function isSeverity(value: string): value is Severity {
  return Object.hasOwn(SEVERITY_LABELS, value)
}

/**
 * The unified timeline: every retained event across sources, filterable by source, severity, and
 * kind. Pausing freezes presentation without letting collection grow (the session keeps its own
 * bounded retention; resuming rehydrates from it), and clearing empties the visible history while
 * the host's dropped-count signal stays truthful.
 */
export function TimelineView({ state, store, port }: TimelineViewProps): ReactElement {
  const [sourceFilter, setSourceFilter] = useState(ALL_SOURCES)
  const [severityFilter, setSeverityFilter] = useState<Severity | typeof ALL_SEVERITIES>(
    ALL_SEVERITIES,
  )
  const [kindFilter, setKindFilter] = useState("")

  const selectedSource = state.sources.find((source) => sourceKey(source.id) === sourceFilter)?.id
  const filtered = filterEvents(state.events, {
    ...(selectedSource === undefined ? {} : { source: selectedSource }),
    ...(severityFilter === ALL_SEVERITIES ? {} : { severity: severityFilter }),
    ...(kindFilter === "" ? {} : { kind: kindFilter }),
  })
  const emptyLabel = useMemo(
    () => (state.events.length === 0 ? "No events recorded yet" : "No events match the filters"),
    [state.events.length],
  )

  return (
    <section aria-label="Timeline" className="grid gap-3">
      <Toolbar
        label="Timeline controls"
        actions={
          <>
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
          </>
        }
      >
        <NativeSelect
          aria-label="Source"
          size="sm"
          value={sourceFilter}
          onChange={(event) => setSourceFilter(event.currentTarget.value)}
        >
          <NativeSelectOption value={ALL_SOURCES}>All sources</NativeSelectOption>
          {state.sources.map((source) => (
            <NativeSelectOption key={sourceKey(source.id)} value={sourceKey(source.id)}>
              {source.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Severity"
          size="sm"
          value={severityFilter}
          onChange={(event) => {
            const { value } = event.currentTarget
            setSeverityFilter(isSeverity(value) ? value : ALL_SEVERITIES)
          }}
        >
          <NativeSelectOption value={ALL_SEVERITIES}>All severities</NativeSelectOption>
          {SEVERITIES.map((severity) => (
            <NativeSelectOption key={severity} value={severity}>
              {SEVERITY_LABELS[severity]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Input
          type="search"
          aria-label="Kind"
          placeholder="Filter by kind"
          value={kindFilter}
          onChange={(event) => setKindFilter(event.currentTarget.value)}
          className="h-7 w-auto min-w-32 flex-1"
        />
      </Toolbar>
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
