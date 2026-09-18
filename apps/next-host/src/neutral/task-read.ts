// The tasks list read through its validation boundary, shared by the RSC prefetch and the client
// query. The mock's decoded `unknown` body is narrowed to the typed `PaginatedResult<Task>` by a
// Standard Schema at the `client.get` seam — the same validation path a real consumer uses — so a
// malformed response fails the read instead of being trusted by an unchecked cast. Neutral and
// server-safe: it names no host global, so the RSC prefetch and the browser query run it alike.

import { buildListQuery, type createHttpClient } from "@plainworks/http"
import {
  type ListQueryParams,
  type ListQueryPlan,
  listQueryOptions,
  type PaginatedResult,
} from "@plainworks/query"
import {
  guardSchema,
  isAbsentOr,
  isNonEmptyString,
  isOneOf,
  isPaginatedResult,
  isRecord,
  type WebAbortSignal,
} from "@plainworks/std"
import { TASKS_RESOURCE } from "./constants"
import type { Task } from "./task"

type HttpClient = ReturnType<typeof createHttpClient>

const TASK_STATUSES: readonly Task["status"][] = ["todo", "in-progress", "done", "blocked"]
const TASK_PRIORITIES: readonly Task["priority"][] = ["low", "medium", "high"]

// A sound `Task` guard: required fields, enum membership for status/priority, and every optional
// field type-checked when present — a malformed row never crosses as a typed `Task`.
function isTaskRow(value: unknown): value is Task {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.title) &&
    isOneOf(value.status, TASK_STATUSES) &&
    isOneOf(value.priority, TASK_PRIORITIES) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    isAbsentOr(value.description, (v) => typeof v === "string") &&
    isAbsentOr(value.assigneeId, (v) => typeof v === "string") &&
    isAbsentOr(value.assigneeName, (v) => typeof v === "string") &&
    isAbsentOr(value.dueDate, (v) => typeof v === "string") &&
    isAbsentOr(value.tags, (v) => Array.isArray(v) && v.every((tag) => typeof tag === "string"))
  )
}

// The response validation boundary: the mock's decoded `unknown` body must satisfy the list
// contract's own envelope guard — every row sound, the pagination block complete, a present
// `facets` block well-formed — or the read fails instead of trusting a fabricated shape.
export const taskPageSchema = guardSchema<PaginatedResult<Task>>(
  (value): value is PaginatedResult<Task> => isPaginatedResult(value, isTaskRow),
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
