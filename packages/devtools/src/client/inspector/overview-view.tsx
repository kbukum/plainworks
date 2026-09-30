"use client"

import { Badge } from "@plainworks/elements/badge"
import { Callout } from "@plainworks/ui/feedback/callout"
import { EmptyState } from "@plainworks/ui/feedback/empty-state"
import type { ReactElement } from "react"
import { sourceKey } from "../../protocol"
import type { DevtoolsStoreState } from "../../store"
import { useDevtoolsLabels } from "../labels"

/** Props for {@link OverviewView}. */
export interface OverviewViewProps {
  /** Current store state. */
  readonly state: DevtoolsStoreState
}

/**
 * The landing view: what is connected, what is healthy, and what observation has already lost.
 * Adapter failures are isolated alerts — one broken source never hides the rest — and dropped
 * events are reported explicitly so an incomplete timeline is never mistaken for a quiet system.
 */
export function OverviewView({ state }: OverviewViewProps): ReactElement {
  const labels = useDevtoolsLabels()
  if (state.sources.length === 0) {
    return <EmptyState title={labels.noSources} description={labels.noSourcesDescription} />
  }

  return (
    <section aria-label={labels.overview} className="grid gap-3">
      {state.droppedAggregate === 0 ? null : (
        <Callout tone="info" title={labels.timelineIncomplete}>
          {labels.eventsReleased(state.droppedAggregate)}
        </Callout>
      )}
      <ul aria-label={labels.sources} className="grid gap-2">
        {state.sources.map((source) => {
          const failure = state.failures.get(sourceKey(source.id))
          const dropped = state.droppedBySource.get(sourceKey(source.id)) ?? 0
          return (
            <li
              key={sourceKey(source.id)}
              className="grid min-w-0 gap-2 rounded-lg border bg-card p-3"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="min-w-0 wrap-anywhere font-medium text-sm">{source.label}</span>
                <span className="min-w-0 wrap-anywhere text-muted-foreground text-xs">
                  {`${source.id.kind} · ${source.id.instance}`}
                </span>
                {failure === undefined ? (
                  <Badge variant="outline" className="ms-auto">
                    {labels.observing}
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="ms-auto">
                    {labels.failed}
                  </Badge>
                )}
              </div>
              {failure === undefined ? null : (
                <Callout tone="danger">
                  {labels.sourceFailed(source.label, String(failure.message))}
                </Callout>
              )}
              <p className="text-muted-foreground text-xs">
                {[
                  labels.commandCount(source.commands.length),
                  dropped > 0 ? labels.sourceDropped(dropped) : undefined,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
