import { TASK_PRIORITIES, type Task } from "@plainworks/demo"
import { isOneOf, isRecord, type StandardSchemaV1 } from "@plainworks/std"
import { TASK_STATUSES } from "../../app/task-shape"

/** The validated shape a submitted task form yields — the editable subset of a {@link Task}. */
export interface TaskFormValues {
  readonly title: string
  readonly status: Task["status"]
  readonly priority: Task["priority"]
  readonly description?: string | null
  readonly dueDate?: string | null
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/**
 * A Standard Schema validating the decoded task form: a required non-empty title, a status and
 * priority drawn from their enums, and an optional description and due date (blank means absent).
 * Failures are reported on each field's path so the kit form renders the message inline. Owning it
 * app-locally keeps the showcase dependency-free while staying assignable wherever a
 * {@link StandardSchemaV1} is expected — the same contract Zod or Valibot would satisfy.
 */
export function taskFormSchema(): StandardSchemaV1<unknown, TaskFormValues> {
  return {
    "~standard": {
      version: 1,
      vendor: "showcase",
      validate: (input) => {
        const values = isRecord(input) ? input : {}
        const issues: { message: string; path: [string] }[] = []

        const title = trimmed(values.title)
        if (title.length === 0) {
          issues.push({ message: "Title is required.", path: ["title"] })
        }

        const status = values.status
        if (!isOneOf(status, TASK_STATUSES)) {
          issues.push({ message: "Choose a status.", path: ["status"] })
        }

        const priority = values.priority
        if (!isOneOf(priority, TASK_PRIORITIES)) {
          issues.push({ message: "Choose a priority.", path: ["priority"] })
        }

        if (issues.length > 0) {
          return { issues }
        }

        const description = trimmed(values.description)
        const dueDate = trimmed(values.dueDate)
        const value: TaskFormValues = {
          title,
          status: status as Task["status"],
          priority: priority as Task["priority"],
          description: description.length > 0 ? description : null,
          dueDate: dueDate.length > 0 ? dueDate : null,
        }
        return { value }
      },
    },
  }
}
