// The `Task` runtime shape in one server-safe place — the enum vocabularies and a sound type guard
// reused by every task boundary: the list read, the write reads, and the live-stream decoder. A
// malformed row can never cross any of them as a typed `Task`. Neutral: it names no host global.

import { TASK_PRIORITIES, type Task } from "@plainworks/demo"
import { isAbsentOr, isNonEmptyString, isOneOf, isRecord } from "@plainworks/std"

/** Every task status, in workflow order. */
export const TASK_STATUSES: readonly Task["status"][] = ["todo", "in-progress", "done", "blocked"]

/**
 * A sound {@link Task} guard: required fields present, enum membership for status/priority, and
 * every optional field type-checked when present.
 */
export function isTask(value: unknown): value is Task {
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
