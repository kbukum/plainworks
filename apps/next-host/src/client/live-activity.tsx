"use client"

import { Button } from "@plainworks/elements/button"
import type { StateSource } from "@plainworks/std/seam"
import { Section } from "@plainworks/ui/layout/section"
import { Pause, Play } from "lucide-react"
import { type ReactElement, useState } from "react"
import { type LiveTasks, useLiveTasks } from "./live-stream"

/**
 * The live-activity feed folded from the unified stream. The stream rewrites the feed while the
 * page sits still, so the list lives in a permanently mounted polite live region: assistive
 * technology hears each update without the feed taking focus. Pausing freezes the feed and silences
 * the region (WCAG 2.2.2); the button's label says what the next press does.
 */
export function LiveActivity({
  source,
}: {
  readonly source: StateSource<LiveTasks>
}): ReactElement {
  const [paused, setPaused] = useState(false)
  const { tasks, error } = useLiveTasks(source, { paused })
  const entries = Object.entries(tasks)
  return (
    <Section
      title="Live activity"
      description="Task updates streamed from the backend as they happen."
      actions={
        <Button variant="outline" size="sm" onClick={() => setPaused((prev) => !prev)}>
          {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
          {paused ? "Resume updates" : "Pause updates"}
        </Button>
      }
    >
      <div aria-live={paused ? "off" : "polite"} className="text-sm">
        {error !== undefined ? (
          <p className="text-muted-foreground">Could not load live activity.</p>
        ) : entries.length === 0 ? (
          <p className="text-muted-foreground">Waiting for the first streamed update…</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border">
            {entries.map(([id, title]) => (
              <li key={id} className="px-3 py-2">
                {title}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}
