import { TASK_PRIORITIES, type Task } from "@plainworks/demo"
import type { SelectFieldOption } from "@plainworks/ui/forms"
import type { FilterFieldOption } from "@plainworks/ui/list"
import { TASK_STATUSES } from "../../app/task-shape"

type BadgeTone = "default" | "secondary" | "destructive" | "outline"

/** Human-readable label for each task status. */
export const STATUS_LABEL: Record<Task["status"], string> = {
  todo: "To do",
  "in-progress": "In progress",
  done: "Done",
  blocked: "Blocked",
}

/** Human-readable label for each task priority. */
export const PRIORITY_LABEL: Record<Task["priority"], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
}

/** Badge tone for each status — blocked reads as an error, done as solid, the rest as quieter. */
export const STATUS_TONE: Record<Task["status"], BadgeTone> = {
  todo: "outline",
  "in-progress": "secondary",
  done: "default",
  blocked: "destructive",
}

/** Badge tone for each priority — high reads as an error, medium as secondary, low as quiet. */
export const PRIORITY_TONE: Record<Task["priority"], BadgeTone> = {
  low: "outline",
  medium: "secondary",
  high: "destructive",
}

/** Status options for a select control, in workflow order. */
export const STATUS_OPTIONS: readonly SelectFieldOption[] = TASK_STATUSES.map((status) => ({
  value: status,
  label: STATUS_LABEL[status],
}))

/** Priority options for a select control, lowest to highest. */
export const PRIORITY_OPTIONS: readonly SelectFieldOption[] = TASK_PRIORITIES.map((priority) => ({
  value: priority,
  label: PRIORITY_LABEL[priority],
}))

// A non-empty option tuple for a `select` filter field, which requires at least one option. The
// throw only guards an empty vocabulary, which the fixed task enums never are.
function nonEmptyOptions<K extends string>(
  values: readonly K[],
  labels: Record<K, string>,
): readonly [FilterFieldOption, ...FilterFieldOption[]] {
  const toOption = (value: K): FilterFieldOption => ({ value, label: labels[value] })
  const [first, ...rest] = values
  if (first === undefined) {
    throw new Error("a select filter field needs at least one option")
  }
  return [toOption(first), ...rest.map(toOption)]
}

/** Status options for the filter bar's select editor — the same vocabulary, as a non-empty tuple. */
export const STATUS_FILTER_OPTIONS = nonEmptyOptions(TASK_STATUSES, STATUS_LABEL)

/** Priority options for the filter bar's select editor — the same vocabulary, as a non-empty tuple. */
export const PRIORITY_FILTER_OPTIONS = nonEmptyOptions(TASK_PRIORITIES, PRIORITY_LABEL)
