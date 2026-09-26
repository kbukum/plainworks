"use client"

import type { ErrorSnapshot } from "@plainworks/std"
import { cn } from "@plainworks/theme"
import { Callout } from "@plainworks/ui/feedback"
import type { ReactElement } from "react"
import {
  type SourceDescriptor,
  type SourceId,
  type StatusIndicator,
  sourceKey,
} from "../../protocol"
import type { RetentionEntry } from "../../retention"
import type { DevtoolsClientPort, IndicatorEntry } from "../../session"
import type { DevtoolsStoreState } from "../../store"
import { CommandSection } from "./command-section"
import { EventList } from "./event-list"

/**
 * Everything a panel — the generic one or an app-supplied custom renderer — needs to render one
 * source instance. Custom renderers receive exactly this; React components never cross the
 * neutral protocol, they are injected at the client call site.
 */
export interface SourcePanelProps {
  /** The source being rendered. */
  readonly source: SourceDescriptor
  /** This source's retained events, oldest first. */
  readonly events: readonly RetentionEntry[]
  /** This source's latest indicator values. */
  readonly indicators: readonly IndicatorEntry[]
  /** The source's latest failure, when the adapter is broken. */
  readonly failure: ErrorSnapshot | undefined
  /** The client port, for on-demand detail and commands. */
  readonly port: DevtoolsClientPort
}

/** A panel component for one source kind, injected at the call site. */
export type SourcePanel = (props: SourcePanelProps) => ReactElement

/** Panels by source kind; kinds without an entry render through {@link GenericSourcePanel}. */
export type SourceRendererMap = Readonly<Record<string, SourcePanel>>

/**
 * Derive the {@link SourcePanelProps} for one source from store state. Shared by the shell's kind
 * panels and available to tests of custom renderers.
 */
export function panelPropsFor(
  state: DevtoolsStoreState,
  id: SourceId,
  port: DevtoolsClientPort,
): SourcePanelProps {
  const key = sourceKey(id)
  const source = state.sources.find((candidate) => sourceKey(candidate.id) === key)
  return {
    source: source ?? { id, label: `${id.kind} ${id.instance}`, commands: [] },
    events: state.events.filter((entry) => sourceKey(entry.id) === key),
    indicators: state.indicators.filter((entry) => sourceKey(entry.id) === key),
    failure: state.failures.get(key),
    port,
  }
}

const SEVERITY_TONE: Readonly<Record<StatusIndicator["severity"], string>> = {
  error: "border-destructive",
  warn: "border-warning",
  info: "",
  ok: "",
}

/**
 * The default panel for any source kind: latest indicators, advertised commands, and the retained
 * event history with on-demand detail. Unknown and custom kinds render through this unless the
 * host injects a kind-specific renderer — every source stays inspectable.
 */
export function GenericSourcePanel({
  source,
  events,
  indicators,
  failure,
  port,
}: SourcePanelProps): ReactElement {
  return (
    <div className="grid gap-4">
      {failure === undefined ? null : (
        <Callout tone="danger">{`${source.label} failed: ${failure.message}`}</Callout>
      )}
      {indicators.length === 0 ? null : (
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2">
          {indicators.map((entry) => (
            <div
              key={entry.indicator.id}
              data-severity={entry.indicator.severity}
              className={cn(
                "min-w-0 rounded-md border bg-card p-2",
                SEVERITY_TONE[entry.indicator.severity],
              )}
            >
              <dt className="wrap-anywhere text-muted-foreground text-xs">
                {entry.indicator.label}
              </dt>
              <dd className="wrap-anywhere font-medium text-sm tabular-nums">
                {entry.indicator.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <CommandSection port={port} source={source} />
      <EventList
        entries={events}
        sources={[source]}
        port={port}
        emptyLabel="No events recorded yet"
      />
    </div>
  )
}
