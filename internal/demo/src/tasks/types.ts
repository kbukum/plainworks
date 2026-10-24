/**
 * Task-related types
 */

/** Task priorities in ascending domain order. */
export const TASK_PRIORITIES = ["low", "medium", "high"] as const

/** A task's priority. */
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

/** Return the domain sort rank for a task priority, or zero for an unrecognized value. */
export function taskPriorityRank(value: unknown): number {
  switch (value) {
    case "low":
      return 1
    case "medium":
      return 2
    case "high":
      return 3
    default:
      return 0
  }
}

/** A task entity. */
export interface Task {
  id: string
  title: string
  description?: string
  status: "todo" | "in-progress" | "done" | "blocked"
  priority: TaskPriority
  assigneeId?: string | undefined
  assigneeName?: string | undefined
  dueDate?: string | undefined
  tags?: string[]
  createdAt: string
  updatedAt: string
}

/** Client input for creating a task. */
export interface CreateTaskInput {
  title: string
  description?: string
  status?: Task["status"]
  priority?: Task["priority"]
  assigneeId?: string
  dueDate?: string
  tags?: string[]
}

/** Client input for updating a task. */
export interface UpdateTaskInput {
  title?: string
  description?: string | null
  status?: Task["status"]
  priority?: Task["priority"]
  assigneeId?: string | null
  dueDate?: string | null
  tags?: string[]
}
