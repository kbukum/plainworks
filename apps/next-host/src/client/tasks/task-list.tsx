"use client"

import { useHttpClient } from "@plainworks/http/client"
import { asyncStatus } from "@plainworks/ui"
import { DataTable, type DataTableColumn } from "@plainworks/ui/data/data-table"
import { StatusBadge, type StatusTone } from "@plainworks/ui/display/status-badge"
import { AsyncState } from "@plainworks/ui/feedback/async-state"
import { EmptyState } from "@plainworks/ui/feedback/empty-state"
import { ErrorState } from "@plainworks/ui/feedback/error-state"
import { LoadingState } from "@plainworks/ui/feedback/loading-state"
import { useQuery } from "@tanstack/react-query"
import type { ReactElement } from "react"
import { TASK_LIST_PARAMS } from "../../neutral/constants"
import type { Task } from "../../neutral/tasks"
import { taskList } from "../../neutral/tasks"

const STATUS: Record<Task["status"], { readonly label: string; readonly tone: StatusTone }> = {
  todo: { label: "To do", tone: "neutral" },
  "in-progress": { label: "In progress", tone: "info" },
  done: { label: "Done", tone: "success" },
  blocked: { label: "Blocked", tone: "danger" },
}

const PRIORITY: Record<Task["priority"], { readonly label: string; readonly tone: StatusTone }> = {
  low: { label: "Low", tone: "neutral" },
  medium: { label: "Medium", tone: "info" },
  high: { label: "High", tone: "warning" },
}

// Status and priority are toned badges with a text label, so state never relies on colour alone.
// On a narrow container the low-priority columns move into each row's details disclosure.
const COLUMNS: readonly DataTableColumn<Task>[] = [
  { id: "title", header: "Title", cell: (task) => task.title },
  {
    id: "status",
    header: "Status",
    nowrap: true,
    cell: (task) => (
      <StatusBadge tone={STATUS[task.status].tone}>{STATUS[task.status].label}</StatusBadge>
    ),
  },
  {
    id: "priority",
    header: "Priority",
    priority: "low",
    nowrap: true,
    cell: (task) => (
      <StatusBadge tone={PRIORITY[task.priority].tone}>{PRIORITY[task.priority].label}</StatusBadge>
    ),
  },
  {
    id: "assignee",
    header: "Assignee",
    priority: "low",
    cell: (task) => task.assigneeName ?? "Unassigned",
  },
]

/**
 * The query-driven task list, server-prefetched and hydrated with no flash. It reads the same
 * `taskList.options` under the identical key the RSC page prefetched, through the request-scoped
 * browser HTTP client, so the warm cache renders immediately. The region shows exactly one state:
 * an announced loading state, a failure the reader can retry, an empty state, or the table.
 */
export function TaskList(): ReactElement {
  const httpClient = useHttpClient()
  const tasks = useQuery(taskList.options(httpClient, TASK_LIST_PARAMS))
  const rows = tasks.data?.data ?? []

  return (
    <AsyncState
      status={asyncStatus({
        pending: tasks.isPending,
        error: tasks.isError,
        empty: rows.length === 0,
      })}
      loading={<LoadingState label="Loading tasks" />}
      error={
        <ErrorState
          title="Tasks are unavailable"
          description="The task list could not be loaded."
          onRetry={() => void tasks.refetch()}
        />
      }
      empty={<EmptyState title="No tasks yet" />}
    >
      <DataTable
        caption="Tasks, highest priority first"
        columns={COLUMNS}
        rows={rows}
        getRowId={(task) => task.id}
        getRowLabel={(task) => task.title}
      />
    </AsyncState>
  )
}
