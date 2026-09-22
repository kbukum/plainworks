"use client"

import { Badge } from "@plainworks/elements/badge"
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
      <p className="py-8 text-center text-muted-foreground text-sm">
        No sources registered. Construct adapters beside your runtime instances and register them
        with the devtools session.
      </p>
    )
  }

  return (
    <section aria-label="Overview" className="grid gap-3">
      {state.droppedAggregate === 0 ? null : (
        <p className="text-muted-foreground text-xs">
          {`${state.droppedAggregate} events dropped — retention is bounded, so the timeline is incomplete.`}
        </p>
      )}
      <ul aria-label="Sources" className="grid gap-2">
        {state.sources.map((source) => {
          const failure = state.failures.get(sourceKey(source.id))
          const dropped = state.droppedBySource.get(sourceKey(source.id)) ?? 0
          return (
            <li key={sourceKey(source.id)} className="grid gap-1 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-sm">{source.label}</span>
                <span className="text-muted-foreground text-xs">
                  {`${source.id.kind} · ${source.id.instance}`}
                </span>
                {failure === undefined ? (
                  <Badge variant="outline">Observing</Badge>
                ) : (
                  <Badge variant="destructive">Failed</Badge>
                )}
              </div>
              {failure === undefined ? null : (
                <p role="alert" className="text-destructive text-xs">
                  {`${source.label}: ${failure.message}`}
                </p>
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
