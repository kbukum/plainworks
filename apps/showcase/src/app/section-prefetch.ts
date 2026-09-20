// Which data each section needs warm before its first paint, in one server-safe place. The SSR
// render prefetches exactly the active section's queries into the request-scoped cache, so the
// browser hydrates that section with no refetch flash; a section without a built body prefetches
// nothing and fetches on the client when it is visited. Neutral — it names no host global, so it
// runs inside the server render graph.

import type { HttpClient } from "@plainworks/http"
import { prefetchQuery } from "@plainworks/query"
import type { QueryClient } from "@tanstack/react-query"
import { RECENT_ACTIVITY_PARAMS, TASK_LIST_PARAMS } from "./constants"
import type { SectionId } from "./navigation"
import { overviewStatsPlan, revenueTrendPlan } from "./overview-read"
import { taskListPlan } from "./task-read"

/** Prefetch the active section's queries into `queryClient` so its first paint needs no refetch. */
export async function prefetchSection(
  section: SectionId,
  queryClient: QueryClient,
  httpClient: HttpClient,
): Promise<void> {
  switch (section) {
    case "overview":
      await Promise.all([
        prefetchQuery(queryClient, overviewStatsPlan(httpClient)),
        prefetchQuery(queryClient, revenueTrendPlan(httpClient)),
        prefetchQuery(queryClient, taskListPlan(httpClient, RECENT_ACTIVITY_PARAMS)),
      ])
      return
    case "tasks":
      await prefetchQuery(queryClient, taskListPlan(httpClient, TASK_LIST_PARAMS))
      return
    default:
      return
  }
}
