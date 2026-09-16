// The tasks list read through its validation boundary, shared by the SSR prefetch and the client
// query. The mock's decoded `unknown` body is narrowed to the typed `PaginatedResult<Task>` by a
// Standard Schema at the `client.get` seam — the same validation path a real consumer uses — so a
// malformed response fails the read instead of being trusted by an unchecked cast. Neutral and
// server-safe: it names no host global, so the server prefetch and the browser query run it alike.

import type { Task } from "@plainworks/demo"
import { buildListQuery, type createHttpClient } from "@plainworks/http"
import {
  type ListQueryParams,
  type ListQueryPlan,
  listQueryOptions,
  type PaginatedResult,
} from "@plainworks/query"
import { isNonEmptyString, isRecord, type WebAbortSignal } from "@plainworks/std"
import { TASKS_RESOURCE } from "./constants"
import { guardSchema } from "./guard-schema"

type HttpClient = ReturnType<typeof createHttpClient>

const TASK_STATUSES: readonly Task["status"][] = ["todo", "in-progress", "done", "blocked"]
const TASK_PRIORITIES: readonly Task["priority"][] = ["low", "medium", "high"]

function isOneOf<T>(value: unknown, options: readonly T[]): value is T {
  return options.some((option) => option === value)
}

function isTaskRow(value: unknown): value is Task {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.title) &&
    isOneOf(value.status, TASK_STATUSES) &&
    isOneOf(value.priority, TASK_PRIORITIES) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  )
}

const taskPageSchema = guardSchema<PaginatedResult<Task>>(
  (value): value is PaginatedResult<Task> =>
    isRecord(value) &&
    Array.isArray(value.data) &&
    value.data.every(isTaskRow) &&
    isRecord(value.pagination) &&
    typeof value.pagination.page === "number" &&
    typeof value.pagination.total === "number",
  "response is not a PaginatedResult<Task>",
)

/** Read one offset page of tasks, validated at the boundary; a bodyless response is a read failure. */
export async function readTaskPage(
  client: HttpClient,
  params: ListQueryParams,
  signal?: WebAbortSignal,
): Promise<PaginatedResult<Task>> {
  const page = await client.get("/api/tasks", {
    query: buildListQuery(params),
    ...(signal ? { signal } : {}),
    schema: taskPageSchema,
  })
  if (page === undefined) {
    throw new Error("GET /api/tasks returned no body")
  }
  return page
}

/**
 * The ready-to-spread {@link ListQueryPlan} for the dashboard's task list — the deterministic cache
 * key plus a `queryFn` that reads one page through {@link readTaskPage}. The server prefetches it
 * and the client mounts it under the identical key, so the hydrated cache is reused with no refetch
 * flash.
 */
export function taskListPlan(client: HttpClient, params: ListQueryParams): ListQueryPlan<Task> {
  return listQueryOptions<Task>({
    resource: TASKS_RESOURCE,
    params,
    fetch: (page, signal) => readTaskPage(client, page, signal),
  })
}
