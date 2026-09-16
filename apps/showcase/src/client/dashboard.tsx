"use client"

import { logout } from "@plainworks/auth/client"
import type { HttpClient } from "@plainworks/http"
import type { Task } from "@plainworks/mocks/domain"
import type { PaginatedResult } from "@plainworks/query"
import type { StateSource } from "@plainworks/std"
import { Breadcrumbs, type BreadcrumbsProps } from "@plainworks/ui/client"
import { useQuery } from "@tanstack/react-query"
import type { ReactElement } from "react"
import { TASK_LIST_PARAMS } from "../app/constants"
import { taskListPlan } from "../app/task-read"
import { type LiveTasks, useLiveTasks } from "./live-stream"
import { routerLinkRender, useRouter } from "./router"
import { useIdentity } from "./session"

/** Props for {@link Dashboard}. */
export interface DashboardProps {
  /** The request-scoped typed fetch client the task query reads through. */
  readonly httpClient: HttpClient
  /** The live-tasks slot the activity feed renders. */
  readonly liveSource: StateSource<LiveTasks>
}

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

function LiveActivity({ source }: { readonly source: StateSource<LiveTasks> }): ReactElement {
  const { tasks, error } = useLiveTasks(source)
  const entries = Object.entries(tasks)
  return (
    <section aria-labelledby="live-heading">
      <h2 id="live-heading">Live activity</h2>
      {error !== undefined ? (
        <p role="alert">Could not load live activity.</p>
      ) : entries.length === 0 ? (
        <p>Waiting for the first streamed update…</p>
      ) : (
        <ul>
          {entries.map(([id, title]) => (
            <li key={id}>{title}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AccountBar(): ReactElement {
  const identity = useIdentity()
  const name =
    (typeof identity?.claims.name === "string" ? identity.claims.name : undefined) ??
    identity?.subject ??
    "Guest"
  return (
    <div>
      <span>
        Signed in as <strong>{name}</strong>
      </span>{" "}
      <button type="button" onClick={() => logout()}>
        Log out
      </button>
    </div>
  )
}

/**
 * The Tasks dashboard — the real feature that exercises the assembled seams: a query-driven task
 * list (server-prefetched, hydrated with no flash), a live-activity feed driven by the unified
 * stream, and router-aware breadcrumbs that navigate client-side through the host's own link.
 */
export function Dashboard({ httpClient, liveSource }: DashboardProps): ReactElement {
  const { path, navigate } = useRouter()
  const tasks = useQuery(taskListPlan(httpClient, TASK_LIST_PARAMS))

  const linkRender = routerLinkRender(navigate)
  const onTasks = path === "/tasks"
  const items: BreadcrumbsProps["items"] = onTasks
    ? [{ label: "Home", href: "/", render: linkRender }, { label: "Tasks" }]
    : [{ label: "Home" }]

  return (
    <main>
      <AccountBar />
      <Breadcrumbs items={items} />
      <nav aria-label="Sections">
        <button type="button" onClick={() => navigate("/")} disabled={!onTasks}>
          Overview
        </button>{" "}
        <button type="button" onClick={() => navigate("/tasks")} disabled={onTasks}>
          Tasks
        </button>
      </nav>

      <h1>{onTasks ? "Tasks" : "Overview"}</h1>

      {onTasks ? (
        tasks.status === "success" ? (
          <TaskTable page={tasks.data} />
        ) : tasks.status === "error" ? (
          <p role="alert">Could not load tasks.</p>
        ) : (
          <p>Loading tasks…</p>
        )
      ) : (
        <p>
          A server-rendered reference dashboard assembled from the plainworks kit. Open the{" "}
          <button type="button" onClick={() => navigate("/tasks")}>
            Tasks
          </button>{" "}
          view to see the query-driven list and the live stream.
        </p>
      )}

      <LiveActivity source={liveSource} />
    </main>
  )
}
