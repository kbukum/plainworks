"use client"

import type { RetentionEntry } from "@plainworks/devtools"
import { Badge } from "@plainworks/elements/badge"
import { ScrollArea } from "@plainworks/elements/scroll-area"
import { isRecord } from "@plainworks/std"
import type { ReactElement } from "react"

/** Props for {@link RequestLog}. */
export interface RequestLogProps {
  /** The source's retained timeline; this component shows only its `mock.request` events. */
  readonly events: readonly RetentionEntry[]
}

interface LoggedRequest {
  readonly key: string
  readonly method: string
  readonly path: string
}

function loggedRequestOf(entry: RetentionEntry): LoggedRequest | undefined {
  if (entry.event.kind !== "mock.request") return undefined
  const summary = entry.event.summary
  const method = isRecord(summary) && typeof summary.method === "string" ? summary.method : "GET"
  const path =
    isRecord(summary) && typeof summary.path === "string" ? summary.path : entry.event.label
  return { key: `${entry.id.kind}:${entry.id.instance}:${entry.seq}`, method, path }
}

/** The demo backend's bounded request log, read from the source's own timeline events. */
export function RequestLog({ events }: RequestLogProps): ReactElement {
  const cleared = events.findLast((entry) => entry.event.kind === "mock.log-cleared")?.seq ?? 0
  const requests = events
    .filter((entry) => entry.seq > cleared)
    .flatMap((entry) => {
      const logged = loggedRequestOf(entry)
      return logged ? [logged] : []
    })

  return (
    <section aria-labelledby="mock-request-log-title" className="grid min-h-0 gap-3">
      <div>
        <h3 id="mock-request-log-title" className="font-medium">
          Request log
        </h3>
        <p className="text-sm text-muted-foreground">Newest mock API requests appear first.</p>
      </div>
      <ScrollArea className="h-48 rounded-lg border">
        {requests.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No mock requests yet.</p>
        ) : (
          <ol className="divide-y" aria-label="Mock requests">
            {[...requests].reverse().map((request) => (
              <li key={request.key} className="flex min-w-0 items-center gap-2 p-3 text-sm">
                <Badge variant="outline">{request.method}</Badge>
                <code className="min-w-0 truncate">{request.path}</code>
              </li>
            ))}
          </ol>
        )}
      </ScrollArea>
    </section>
  )
}
