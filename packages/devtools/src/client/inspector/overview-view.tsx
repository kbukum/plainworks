"use client"

import { Badge } from "@plainworks/elements/badge"
import { Callout, EmptyState } from "@plainworks/ui/feedback"
import type { ReactElement } from "react"
import { sourceKey } from "../../protocol"
import type { DevtoolsStoreState } from "../../store"

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
  if (state.sources.length === 0) {
    return (
      <EmptyState
        title="No sources registered"
        description="Construct adapters beside your runtime instances and register them with the devtools session."
      />
    )
  }

  return (
    <section aria-label="Overview" className="grid gap-3">
      {state.droppedAggregate === 0 ? null : (
        <Callout tone="info" title="The timeline is incomplete">
          {`${state.droppedAggregate} events dropped — retention is bounded, so the oldest events were released.`}
        </Callout>
      )}
      <ul aria-label="Sources" className="grid gap-2">
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
                    Observing
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="ms-auto">
                    Failed
                  </Badge>
                )}
              </div>
              {failure === undefined ? null : (
                <Callout tone="danger">{`${source.label}: ${failure.message}`}</Callout>
              )}
              <p className="text-muted-foreground text-xs">
                {[
                  `${source.commands.length} command${source.commands.length === 1 ? "" : "s"}`,
                  dropped > 0 ? `${dropped} events dropped` : undefined,
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
