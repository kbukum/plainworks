// The tasks list, shared by the RSC prefetch and the client query. Every page is validated against
// the list envelope and the row guard below before it is trusted. Neutral and server-safe: it names
// no host global.

import { httpListQuery } from "@plainworks/query/http-list"
import { isAbsentOr, isNonEmptyString, isOneOf, isRecord } from "@plainworks/std"
import { TASKS_RESOURCE } from "./constants"
import type { Task } from "./task"

const TASK_STATUSES: readonly Task["status"][] = ["todo", "in-progress", "done", "blocked"]
const TASK_PRIORITIES: readonly Task["priority"][] = ["low", "medium", "high"]

// A sound `Task` guard: required fields, enum membership for status/priority, and every optional
// field type-checked when present — a malformed row never crosses as a typed `Task`.
export function isTaskRow(value: unknown): value is Task {
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

/** The task list: `taskList.read` for one validated page, `taskList.options` for the query plan. */
export const taskList = httpListQuery<Task>({
  path: "/api/tasks",
  resource: TASKS_RESOURCE,
  row: isTaskRow,
})
