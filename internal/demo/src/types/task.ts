/**
 * Task-related types
 */

/** A task entity. */
export interface Task {
  id: string
  title: string
  description?: string
  status: "todo" | "in-progress" | "done" | "blocked"
  priority: "low" | "medium" | "high"
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
  description?: string
  status?: Task["status"]
  priority?: Task["priority"]
  assigneeId?: string
  dueDate?: string
  tags?: string[]
}
