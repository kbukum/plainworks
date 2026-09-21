// Which data each section needs warm before its first paint, in one server-safe place. The SSR
// render prefetches exactly the active section's queries into the request-scoped cache, so the
// browser hydrates that section without a loading flash; a section without a built body prefetches
// nothing and fetches on the client when it is visited. Neutral — it names no host global, so it
// runs inside the server render graph.

import type { HttpClient } from "@plainworks/http"
import { prefetchQuery } from "@plainworks/query"
import type { QueryClient } from "@tanstack/react-query"
import {
  NOTIFICATION_LIST_PARAMS,
  ORDER_LIST_PARAMS,
  PRODUCT_LIST_PARAMS,
  RECENT_ACTIVITY_PARAMS,
  TASK_LIST_PARAMS,
  USER_LIST_PARAMS,
} from "./constants"
import type { SectionId } from "./navigation"
import { notificationListPlan } from "./notification-read"
import { orderListPlan } from "./order-read"
import { overviewStatsPlan, productSalesPlan, revenueTrendPlan } from "./overview-read"
import { productListPlan } from "./product-read"
import { taskListPlan } from "./task-read"
import { userListPlan } from "./user-read"

/** Prefetch the active section's queries so its first paint has data while freshness is checked. */
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
        prefetchQuery(queryClient, productSalesPlan(httpClient)),
        prefetchQuery(queryClient, taskListPlan(httpClient, RECENT_ACTIVITY_PARAMS)),
      ])
      return
    case "tasks":
      await prefetchQuery(queryClient, taskListPlan(httpClient, TASK_LIST_PARAMS))
      return
    case "orders":
      await prefetchQuery(queryClient, orderListPlan(httpClient, ORDER_LIST_PARAMS))
      return
    case "products":
      await prefetchQuery(queryClient, productListPlan(httpClient, PRODUCT_LIST_PARAMS))
      return
    case "users":
      await prefetchQuery(queryClient, userListPlan(httpClient, USER_LIST_PARAMS))
      return
    case "notifications":
      await prefetchQuery(queryClient, notificationListPlan(httpClient, NOTIFICATION_LIST_PARAMS))
      return
    default:
      return
  }
}
