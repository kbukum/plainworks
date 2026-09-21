"use client"

import { Badge } from "@plainworks/elements/badge"
import { Button } from "@plainworks/elements/button"
import { ScrollArea } from "@plainworks/elements/scroll-area"
import type { ReactElement } from "react"
import type { MockRequestEntry } from "./mock-control"

/** Props for the mock request log. */
export interface RequestLogProps {
  readonly requests: readonly MockRequestEntry[]
  readonly pending: boolean
  readonly onClear: () => void
}

function requestPath(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}

/** The bounded request history reported by the demo mock control plane. */
export function RequestLog({ requests, pending, onClear }: RequestLogProps): ReactElement {
  return (
    <section aria-labelledby="mock-request-log-title" className="grid min-h-0 gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 id="mock-request-log-title" className="font-medium">
            Request log
          </h3>
          <p className="text-sm text-muted-foreground">Newest mock API requests appear first.</p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onClear}>
          Clear log
        </Button>
      </div>
      <ScrollArea className="h-48 rounded-lg border">
        {requests.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No mock requests yet.</p>
        ) : (
          <ol className="divide-y" aria-label="Mock requests">
            {[...requests].reverse().map((request) => (
              <li key={request.id} className="grid gap-1 p-3 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <Badge variant="outline">{request.method}</Badge>
                  <code className="min-w-0 truncate">{requestPath(request.url)}</code>
                </div>
                <time className="text-xs text-muted-foreground" dateTime={request.timestamp}>
                  {request.timestamp}
                </time>
              </li>
            ))}
          </ol>
        )}
      </ScrollArea>
    </section>
  )
}
