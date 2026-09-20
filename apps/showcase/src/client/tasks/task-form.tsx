"use client"

import type { Task } from "@plainworks/demo"
import { Button } from "@plainworks/elements/button"
import { Callout } from "@plainworks/ui/feedback"
import {
  DateField,
  Form,
  FormSubmit,
  SelectField,
  TextareaField,
  TextField,
} from "@plainworks/ui/forms"
import type { ReactElement } from "react"
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from "./task-fields"
import { type TaskFormValues, taskFormSchema } from "./task-schema"

/** Props for {@link TaskForm}. */
export interface TaskFormProps {
  /** The task being edited, or `undefined` when creating a new one — drives the field defaults. */
  readonly task?: Task | undefined
  /** Called with the validated values; may be async while the mutation settles. */
  readonly onSubmit: (values: TaskFormValues) => void | Promise<void>
  /** Cancel without submitting — closes the surrounding dialog. */
  readonly onCancel: () => void
  /** Submit button copy, e.g. "Create task" or "Save changes". */
  readonly submitLabel: string
  /** The last submit failure, rendered inside the dialog's focus and accessibility boundary. */
  readonly error?: unknown
}

/** The date portion of an ISO timestamp, for a `date` input's default value. */
function dateInputValue(value: string | undefined): string | undefined {
  return value === undefined ? undefined : value.slice(0, 10)
}

/**
 * The create/edit task form, validated by {@link taskFormSchema} through the kit's schema-driven
 * `Form`. It exercises a text, textarea, select, and date field; each field renders its own inline
 * validation message, and the submit button stays pending until `onSubmit` settles. Uncontrolled by
 * design — the fields submit through `FormData`, so a failed validation keeps every entered value.
 */
export function TaskForm({
  task,
  onSubmit,
  onCancel,
  submitLabel,
  error,
}: TaskFormProps): ReactElement {
  return (
    <Form schema={taskFormSchema()} onSubmit={onSubmit} className="@container grid gap-4">
      {error !== undefined ? (
        <Callout tone="danger" title="That change could not be saved">
          Check your connection and try again.
        </Callout>
      ) : null}
      <TextField
        name="title"
        label="Title"
        required
        defaultValue={task?.title}
        placeholder="Draft the release notes"
      />
      <TextareaField
        name="description"
        label="Description"
        defaultValue={task?.description}
        placeholder="Optional details"
      />
      <div className="grid gap-4 @sm:grid-cols-2">
        <SelectField
          name="status"
          label="Status"
          options={STATUS_OPTIONS}
          defaultValue={task?.status ?? "todo"}
        />
        <SelectField
          name="priority"
          label="Priority"
          options={PRIORITY_OPTIONS}
          defaultValue={task?.priority ?? "medium"}
        />
      </div>
      <DateField name="dueDate" label="Due date" defaultValue={dateInputValue(task?.dueDate)} />
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <FormSubmit>{submitLabel}</FormSubmit>
      </div>
    </Form>
  )
}
