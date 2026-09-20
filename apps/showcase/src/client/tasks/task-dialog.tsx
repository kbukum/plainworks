"use client"

import type { Task } from "@plainworks/demo"
import { Modal } from "@plainworks/ui/overlays"
import type { ReactElement } from "react"
import { TaskForm } from "./task-form"
import type { TaskFormValues } from "./task-schema"

/** Props for {@link TaskDialog}. */
export interface TaskDialogProps {
  /** Whether the dialog is open — controlled by the section. */
  readonly open: boolean
  /** Requested open-state change (close on cancel, backdrop, or a settled submit). */
  readonly onOpenChange: (open: boolean) => void
  /** The task being edited, or `undefined` to create a new one. */
  readonly task?: Task | undefined
  /** Persist the values; resolves `true` when the write succeeds so the dialog can close. */
  readonly onSubmit: (values: TaskFormValues) => Promise<boolean>
  /** The last submit failure, shown inside the modal while the form remains open. */
  readonly error?: unknown
}

/**
 * The create/edit dialog: a labelled {@link Modal} wrapping the {@link TaskForm}. It closes only
 * once the submit succeeds, so a failed request keeps the dialog — and every entered value — in
 * place while the section surfaces the error.
 */
export function TaskDialog({
  open,
  onOpenChange,
  task,
  onSubmit,
  error,
}: TaskDialogProps): ReactElement {
  const editing = task !== undefined
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit task" : "New task"}
      description={editing ? "Update the task and save your changes." : "Add a task to the board."}
    >
      <TaskForm
        task={task}
        error={error}
        submitLabel={editing ? "Save changes" : "Create task"}
        onCancel={() => onOpenChange(false)}
        onSubmit={async (values) => {
          if (await onSubmit(values)) {
            onOpenChange(false)
          }
        }}
      />
    </Modal>
  )
}
