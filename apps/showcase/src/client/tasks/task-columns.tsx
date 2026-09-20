"use client"

import type { Task } from "@plainworks/demo"
import { Badge } from "@plainworks/elements/badge"
import { Button } from "@plainworks/elements/button"
import type { DataTableColumn } from "@plainworks/ui/data-table"
import { DateValue } from "@plainworks/ui/display"
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from "../../app/constants"
import { PRIORITY_LABEL, PRIORITY_TONE, STATUS_LABEL, STATUS_TONE } from "./task-fields"

/** Options for {@link taskColumns}. */
export interface TaskColumnsOptions {
  /**
   * Edit handler for a row's action button. When omitted (the caller lacks manage rights), the
   * actions column is dropped entirely rather than rendered disabled.
   */
  readonly onEdit?: (task: Task) => void
}

/**
 * The task table columns. Status and priority render as toned badges so state is never conveyed by
 * color alone (each badge carries its label), the due date formats through the kit's SSR-stable
 * {@link DateValue}, and an optional edit action appears only when the caller is authorized. The
 * sortable columns match the backend's sort keys, so a header click maps straight to the request.
 */
export function taskColumns({ onEdit }: TaskColumnsOptions = {}): DataTableColumn<Task>[] {
  const columns: DataTableColumn<Task>[] = [
    {
      id: "title",
      header: "Title",
      sortable: true,
      cell: (task) => <span className="font-medium">{task.title}</span>,
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      cell: (task) => <Badge variant={STATUS_TONE[task.status]}>{STATUS_LABEL[task.status]}</Badge>,
    },
    {
      id: "priority",
      header: "Priority",
      sortable: true,
      priority: "low",
      cell: (task) => (
        <Badge variant={PRIORITY_TONE[task.priority]}>{PRIORITY_LABEL[task.priority]}</Badge>
      ),
    },
    {
      id: "assignee",
      header: "Assignee",
      priority: "low",
      cell: (task) => task.assigneeName ?? "Unassigned",
    },
    {
      id: "dueDate",
      header: "Due",
      cell: (task) =>
        task.dueDate === undefined ? (
          "—"
        ) : (
          <DateValue value={task.dueDate} locale={DISPLAY_LOCALE} timeZone={DISPLAY_TIME_ZONE} />
        ),
    },
  ]

  if (onEdit !== undefined) {
    columns.push({
      id: "actions",
      header: "Actions",
      align: "end",
      cell: (task) => (
        <Button variant="ghost" size="sm" onClick={() => onEdit(task)}>
          Edit
          <span className="sr-only"> {task.title}</span>
        </Button>
      ),
    })
  }

  return columns
}
