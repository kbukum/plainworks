"use client"

import { Button } from "@plainworks/elements/button"
import { Input } from "@plainworks/elements/input"
import { NativeSelect, NativeSelectOption } from "@plainworks/elements/native-select"
import { Toolbar } from "@plainworks/ui/layout/toolbar"
import { type ReactElement, useState } from "react"
import { isSeverity, type Severity, sourceKey } from "../../protocol"
import type { DevtoolsClientPort } from "../../session"
import { type DevtoolsStore, type DevtoolsStoreState, filterEvents } from "../../store"
import { type DevtoolsLabels, useDevtoolsLabels } from "../labels"
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
  const labels = useDevtoolsLabels()
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
  const emptyLabel = state.events.length === 0 ? labels.noEvents : labels.noMatchingEvents

  return (
    <section aria-label={labels.timeline} className="grid gap-3">
      <Toolbar
        label={labels.timelineControls}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => (state.paused ? store.resume() : store.pause())}
            >
              {state.paused ? labels.resume : labels.pause}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={state.events.length === 0}
              onClick={() => store.clear()}
            >
              {labels.clear}
            </Button>
          </>
        }
      >
        <NativeSelect
          aria-label={labels.sourceFilter}
          size="sm"
          value={sourceFilter}
          onChange={(event) => setSourceFilter(event.currentTarget.value)}
        >
          <NativeSelectOption value={ALL_SOURCES}>{labels.allSources}</NativeSelectOption>
          {state.sources.map((source) => (
            <NativeSelectOption key={sourceKey(source.id)} value={sourceKey(source.id)}>
              {source.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label={labels.severityFilter}
          size="sm"
          value={severityFilter}
          onChange={(event) => {
            const { value } = event.currentTarget
            setSeverityFilter(isSeverity(value) ? value : ALL_SEVERITIES)
          }}
        >
          <NativeSelectOption value={ALL_SEVERITIES}>{labels.allSeverities}</NativeSelectOption>
          {SEVERITIES.map((severity) => (
            <NativeSelectOption key={severity} value={severity}>
              {labels.severity(severity)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Input
          type="search"
          aria-label={labels.kindFilter}
          placeholder={labels.kindPlaceholder}
          value={kindFilter}
          onChange={(event) => setKindFilter(event.currentTarget.value)}
          className="h-7 w-auto min-w-32 flex-1"
        />
      </Toolbar>
      <p role="status" className="text-muted-foreground text-xs">
        {timelineStatus(state, filtered.length, labels)}
      </p>
      <EventList entries={filtered} sources={state.sources} port={port} emptyLabel={emptyLabel} />
    </section>
  )
}

function timelineStatus(
  state: DevtoolsStoreState,
  visible: number,
  labels: DevtoolsLabels,
): string {
  const parts = [
    visible === state.events.length
      ? labels.eventCount(state.events.length)
      : labels.filteredEventCount(visible, state.events.length),
  ]
  if (state.droppedAggregate > 0) parts.push(labels.timelineDropped(state.droppedAggregate))
  if (state.paused) parts.push(labels.paused)
  return parts.join(" · ")
}
