"use client"

import type { CreateTaskInput, Task, UpdateTaskInput } from "@plainworks/demo"
import { useHttpClient } from "@plainworks/http/client"
import { optimisticMutationOptions } from "@plainworks/query/mutation"
import type { ListQueryParams, PaginatedResult } from "@plainworks/std/list"
import type { QueryKey } from "@tanstack/react-query"
import { useMutation } from "@tanstack/react-query"
import { useCallback, useRef, useState } from "react"
import {
  createTask as createTaskRequest,
  dropTaskFromPage,
  reconcileTaskInPage,
  updateTask as updateTaskRequest,
} from "../../neutral/tasks"
import type { TaskFormValues } from "./task-schema"

type TaskPage = PaginatedResult<Task>

/** The task mutations bound to the currently-viewed list, plus the last failure to surface. */
export interface TaskMutations {
  /** Create a task optimistically; resolves `true` on success, `false` (with `error` set) on failure. */
  readonly create: (values: TaskFormValues) => Promise<boolean>
  /** Edit a task optimistically; resolves `true` on success, `false` (with `error` set) on failure. */
  readonly edit: (task: Task, values: TaskFormValues) => Promise<boolean>
  /** The last mutation failure, or `undefined` — rendered as a typed error, never swallowed. */
  readonly error: unknown
  /** Clear the surfaced error (e.g. when the dialog reopens). */
  readonly clearError: () => void
}

function toCreateInput(values: TaskFormValues): CreateTaskInput {
  return {
    title: values.title,
    status: values.status,
    priority: values.priority,
    ...(values.description ? { description: values.description } : {}),
    ...(values.dueDate ? { dueDate: values.dueDate } : {}),
  }
}

function toUpdateInput(values: TaskFormValues): UpdateTaskInput {
  return {
    title: values.title,
    status: values.status,
    priority: values.priority,
    description: values.description ?? null,
    dueDate: values.dueDate ?? null,
  }
}

interface CreateVariables {
  readonly values: TaskFormValues
  /** The row shown until the server answers; its `optimistic-N` id is swapped for the real one. */
  readonly provisional: Task
}

interface EditVariables {
  readonly task: Task
  readonly values: TaskFormValues
}

function provisionalTask(id: string, values: TaskFormValues): Task {
  const now = new Date().toISOString()
  return {
    id,
    title: values.title,
    status: values.status,
    priority: values.priority,
    ...(values.description ? { description: values.description } : {}),
    ...(values.dueDate ? { dueDate: values.dueDate } : {}),
    createdAt: now,
    updatedAt: now,
  }
}

function editedTask(task: Task, values: TaskFormValues): Task {
  const { description: _description, dueDate: _dueDate, ...rest } = task
  return {
    ...rest,
    title: values.title,
    status: values.status,
    priority: values.priority,
    ...(values.description ? { description: values.description } : {}),
    ...(values.dueDate ? { dueDate: values.dueDate } : {}),
    updatedAt: new Date().toISOString(),
  }
}

/**
 * The optimistic create/edit mutations for the task list under `queryKey`. Each shows the change in
 * the list at once, swaps in the persisted row when the server answers, and rolls back on failure.
 * The list re-syncs from the server once every write settles. A failure is kept in `error` for the
 * caller to render, never swallowed.
 */
export function useTaskMutations(queryKey: QueryKey, params: ListQueryParams): TaskMutations {
  const httpClient = useHttpClient()
  const [error, setError] = useState<unknown>(undefined)
  const provisionalCount = useRef(0)

  const createMutation = useMutation(
    optimisticMutationOptions<Task, CreateVariables, TaskPage>({
      queryKey,
      mutationFn: ({ values }) => createTaskRequest(httpClient, toCreateInput(values)),
      apply: (page, { provisional }) =>
        reconcileTaskInPage(page, provisional, params, "create").page,
      reconcile: (page, created, { provisional }) =>
        reconcileTaskInPage(dropTaskFromPage(page, provisional.id), created, params, "create").page,
    }),
  )

  const editMutation = useMutation(
    optimisticMutationOptions<Task, EditVariables, TaskPage>({
      queryKey,
      mutationFn: ({ task, values }) =>
        updateTaskRequest(httpClient, task.id, toUpdateInput(values)),
      apply: (page, { task, values }) =>
        reconcileTaskInPage(page, editedTask(task, values), params, "update").page,
      reconcile: (page, updated) => reconcileTaskInPage(page, updated, params, "update").page,
    }),
  )

  const settle = useCallback(
    (write: Promise<unknown>): Promise<boolean> =>
      write.then(
        () => {
          setError(undefined)
          return true
        },
        (cause: unknown) => {
          setError(cause)
          return false
        },
      ),
    [],
  )

  const { mutateAsync: createAsync } = createMutation
  const { mutateAsync: editAsync } = editMutation

  const create = useCallback(
    (values: TaskFormValues): Promise<boolean> => {
      provisionalCount.current += 1
      const provisional = provisionalTask(`optimistic-${provisionalCount.current}`, values)
      return settle(createAsync({ values, provisional }))
    },
    [createAsync, settle],
  )

  const edit = useCallback(
    (task: Task, values: TaskFormValues): Promise<boolean> => settle(editAsync({ task, values })),
    [editAsync, settle],
  )

  const clearError = useCallback(() => setError(undefined), [])

  return { create, edit, error, clearError }
}
