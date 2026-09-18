// The app's local task domain type. A generated app owns its entities — the kit ships the mock
// *primitives* (`@plainworks/mocks`), not a demo domain — so `Task` lives here and the mock
// backend, the read boundary, and the client list all narrow against this one definition.
// Replace it with your real domain as the app grows.

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
