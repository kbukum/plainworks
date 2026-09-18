"use client"

import type { PaginatedResult } from "@plainworks/query"
import { useQuery } from "@tanstack/react-query"
import type { ReactElement } from "react"
import { TASK_LIST_PARAMS } from "../neutral/constants"
import type { Task } from "../neutral/task"
import { taskListPlan } from "../neutral/task-read"
import { useHttpClient } from "./http-client"

const STATUS_LABEL: Record<Task["status"], string> = {
  todo: "To do",
  "in-progress": "In progress",
  done: "Done",
  blocked: "Blocked",
}

function TaskTable({ page }: { readonly page: PaginatedResult<Task> }): ReactElement {
  return (
    <table>
      <caption>Tasks, highest priority first</caption>
      <thead>
        <tr>
          <th scope="col">Title</th>
          <th scope="col">Status</th>
          <th scope="col">Priority</th>
        </tr>
      </thead>
      <tbody>
        {page.data.map((task) => (
          <tr key={task.id}>
            <td>{task.title}</td>
            <td>{STATUS_LABEL[task.status]}</td>
            <td>{task.priority}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * The query-driven task list — server-prefetched and hydrated with no flash. It reads the same
 * `taskListPlan` under the identical key the RSC page prefetched, through the request-scoped
 * browser HTTP client, so the warm cache renders immediately and refetches hit the same backend.
 * The outcome swaps in place inside a permanently mounted polite live region, so a screen reader
 * hears the load finish (or fail) instead of the change happening silently.
 */
export function TaskList(): ReactElement {
  const httpClient = useHttpClient()
  const tasks = useQuery(taskListPlan(httpClient, TASK_LIST_PARAMS))

  return (
    <div aria-live="polite" aria-busy={tasks.status === "pending"}>
      {tasks.status === "success" ? (
        <TaskTable page={tasks.data} />
      ) : tasks.status === "error" ? (
        <p>Could not load tasks.</p>
      ) : (
        <p>Loading tasks…</p>
      )}
    </div>
  )
}
