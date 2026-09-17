// The gated Tasks route (RSC). It enforces the session gate, prefetches the task list into a
// request-scoped query client through `@plainworks/query` over `@plainworks/http`, and hands the
// dehydrated cache to the client `HydrationBoundary` — so the browser mounts the list under the
// identical key with no refetch flash. Dynamic: the prefetch reads the live mock backend per
// request.

import { createHttpClient } from "@plainworks/http"
import { createQueryClient, dehydrateClient, prefetchQuery } from "@plainworks/query"
import { HydrationBoundary } from "@plainworks/query/client"
import type { ReactElement } from "react"
import { TaskList } from "../../client/task-list"
import { TASK_LIST_PARAMS, TASKS_PATH } from "../../neutral/constants"
import { taskListPlan } from "../../neutral/task-read"
import { requestOrigin, requireSession } from "../../server/session"

export const dynamic = "force-dynamic"

export default async function TasksPage(): Promise<ReactElement> {
  await requireSession(TASKS_PATH)
  const httpClient = createHttpClient({ baseUrl: requestOrigin() })
  const queryClient = createQueryClient()
  await prefetchQuery(queryClient, taskListPlan(httpClient, TASK_LIST_PARAMS))
  // Ship only successful queries across the RSC boundary: a failed prefetch caches an `HttpError`
  // instance Next cannot serialize, so dehydrating it would break the page. Skipping it lets
  // `TaskList` mount cold and refetch on the client instead.
  const dehydratedState = dehydrateClient(queryClient, {
    shouldDehydrateQuery: (query) => query.state.status === "success",
  })

  return (
    <HydrationBoundary state={dehydratedState}>
      <h1>Tasks</h1>
      <TaskList />
    </HydrationBoundary>
  )
}
