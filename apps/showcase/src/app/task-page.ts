import { type Task, taskPriorityRank } from "@plainworks/demo"
import type { PaginatedResult } from "@plainworks/query"
import type { ListQueryParams } from "@plainworks/std"

/** Result of reconciling one task into a cached list page. */
export interface TaskPageReconciliation {
  readonly page: PaginatedResult<Task> | undefined
  /** Whether the server must re-evaluate list membership, ordering, or page boundaries. */
  readonly requiresRefetch: boolean
}

/** What the caller knows about an upsert's effect on the complete server-side collection. */
export type TaskPageReconciliationKind = "create" | "update" | "upsert"

function taskField(task: Task, field: string): unknown {
  switch (field) {
    case "id":
      return task.id
    case "title":
      return task.title
    case "description":
      return task.description
    case "status":
      return task.status
    case "priority":
      return task.priority
    case "assigneeId":
      return task.assigneeId
    case "assigneeName":
      return task.assigneeName
    case "dueDate":
      return task.dueDate
    case "tags":
      return task.tags
    case "createdAt":
      return task.createdAt
    case "updatedAt":
      return task.updatedAt
    default:
      return undefined
  }
}

function compareTasks(left: Task, right: Task, params: ListQueryParams): number {
  if (params.sortBy === undefined) {
    return 0
  }
  const leftValue = taskField(left, params.sortBy)
  const rightValue = taskField(right, params.sortBy)
  let comparison: number
  if (params.sortBy === "priority") {
    comparison = taskPriorityRank(left.priority) - taskPriorityRank(right.priority)
  } else if (typeof leftValue === "number" && typeof rightValue === "number") {
    comparison = leftValue - rightValue
  } else {
    comparison = String(leftValue).localeCompare(String(rightValue))
  }
  return params.order === "desc" ? -comparison : comparison
}

/**
 * Reconcile an upsert immediately where possible and flag any case that needs server ordering,
 * membership, or pagination to be recomputed.
 */
export function reconcileTaskInPage(
  page: PaginatedResult<Task> | undefined,
  task: Task,
  params: ListQueryParams,
  kind: TaskPageReconciliationKind,
): TaskPageReconciliation {
  if (page === undefined) {
    return { page, requiresRefetch: true }
  }

  const index = page.data.findIndex((row) => row.id === task.id)
  const serverEvaluatedMembership =
    (params.filters !== undefined && params.filters.length > 0) || params.search !== undefined
  if (serverEvaluatedMembership) {
    return { page, requiresRefetch: true }
  }

  if (index >= 0) {
    const previous = page.data[index]
    if (previous === undefined) {
      return { page, requiresRefetch: true }
    }
    const data = page.data.map((row) => (row.id === task.id ? task : row))
    const sortChanged =
      params.sortBy !== undefined &&
      taskField(previous, params.sortBy) !== taskField(task, params.sortBy)
    const searchChanged =
      params.search !== undefined &&
      (previous.title !== task.title || previous.description !== task.description)
    return {
      page: { ...page, data },
      requiresRefetch: sortChanged || searchChanged,
    }
  }

  if (kind !== "create") {
    return { page, requiresRefetch: true }
  }

  const canInsert = (params.page ?? page.pagination.page) === 1 && params.cursor === undefined
  if (!canInsert) {
    return { page, requiresRefetch: true }
  }

  const total = page.pagination.total + 1
  const data =
    params.sortBy === undefined
      ? [task, ...page.data]
      : [task, ...page.data].sort((left, right) => compareTasks(left, right, params))
  return {
    page: {
      ...page,
      data: data.slice(0, page.pagination.pageSize),
      pagination: {
        ...page.pagination,
        total,
        totalPages: Math.ceil(total / page.pagination.pageSize),
      },
    },
    requiresRefetch: false,
  }
}

/** Return `page` with the row `id` removed, or unchanged when it holds no such row. */
export function dropTaskFromPage(
  page: PaginatedResult<Task> | undefined,
  id: string,
): PaginatedResult<Task> | undefined {
  if (page === undefined || !page.data.some((row) => row.id === id)) {
    return page
  }
  return {
    ...page,
    data: page.data.filter((row) => row.id !== id),
    pagination: { ...page.pagination, total: page.pagination.total - 1 },
  }
}
