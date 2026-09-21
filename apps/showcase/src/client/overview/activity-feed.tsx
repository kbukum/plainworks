"use client"

import { Badge } from "@plainworks/elements/badge"
import { DateValue } from "@plainworks/ui/display"
import { Callout, SkeletonText } from "@plainworks/ui/feedback"
import { useQuery } from "@tanstack/react-query"
import type { ReactElement } from "react"
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE, RECENT_ACTIVITY_PARAMS } from "../../app/constants"
import { taskListPlan } from "../../app/task-read"
import { useHttpClient } from "../http-client"
import { routerLinkRender, useRouter } from "../router"
import { STATUS_LABEL, STATUS_TONE } from "../tasks/task-fields"

/**
 * The recent-activity feed: the newest tasks, read through the same validated list plan the Tasks
 * board uses so the two never diverge. It renders a first-class loading, empty, and error state —
 * a failed read surfaces a typed callout, never a silent blank.
 */
export function ActivityFeed(): ReactElement {
  const httpClient = useHttpClient()
  const { navigate } = useRouter()
  const renderLink = routerLinkRender(navigate)
  const query = useQuery(taskListPlan(httpClient, RECENT_ACTIVITY_PARAMS))

  if (query.isPending) {
    return (
      <div role="status" aria-label="Loading recent activity">
        <SkeletonText lines={5} />
      </div>
    )
  }

  if (query.isError) {
    return (
      <Callout tone="danger" title="Recent activity is unavailable">
        The activity feed could not be loaded. Try again shortly.
      </Callout>
    )
  }

  const tasks = query.data.data
  if (tasks.length === 0) {
    return <p className="text-muted-foreground text-sm">No recent activity yet.</p>
  }

  return (
    <ul aria-label="Recent activity" className="grid gap-3">
      {tasks.map((task) => (
        <li key={task.id} className="flex items-center justify-between gap-3">
          {renderLink({
            href: "/tasks",
            className:
              "min-w-0 truncate rounded-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            children: task.title,
          })}
          <span className="flex shrink-0 items-center gap-2">
            <Badge variant={STATUS_TONE[task.status]}>{STATUS_LABEL[task.status]}</Badge>
            <span className="text-muted-foreground text-sm">
              <DateValue
                value={task.createdAt}
                locale={DISPLAY_LOCALE}
                timeZone={DISPLAY_TIME_ZONE}
              />
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
