"use client"

import type { CreateTaskInput, Task, UpdateTaskInput } from "@plainworks/demo"
import { optimisticUpdate, type PaginatedResult, writeQueryData } from "@plainworks/query"
import type { ListQueryParams } from "@plainworks/std"
import type { QueryKey } from "@tanstack/react-query"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"
import { dropTaskFromPage, reconcileTaskInPage } from "../../app/task-page"
import {
  createTask as createTaskRequest,
  updateTask as updateTaskRequest,
} from "../../app/task-write"
import { useHttpClient } from "../http-client"
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

/**
 * The optimistic create/edit mutations for the task list under `queryKey`. Each writes the change
 * into the cache immediately, performs the real request, reconciles the cache with the persisted
 * row on success, and rolls the optimistic write back on failure — surfacing a typed error instead
 * of a silent or success-shaped fallback. Every request is issued through the request-scoped HTTP
 * client and carries an `AbortSignal` that fires on unmount, so an in-flight write never settles
 * onto a torn-down component.
 */
export function useTaskMutations(queryKey: QueryKey, params: ListQueryParams): TaskMutations {
  const httpClient = useHttpClient()
  const queryClient = useQueryClient()
  const [error, setError] = useState<unknown>(undefined)
  const provisionalCount = useRef(0)
  const lifecycle = useRef<AbortController>(new AbortController())

  useEffect(() => {
    const controller = lifecycle.current
    return () => controller.abort()
  }, [])

  const clearError = useCallback(() => setError(undefined), [])

  const create = useCallback(
    async (values: TaskFormValues): Promise<boolean> => {
      const now = new Date().toISOString()
      provisionalCount.current += 1
      const provisional: Task = {
        id: `optimistic-${provisionalCount.current}`,
        title: values.title,
        status: values.status,
        priority: values.priority,
        ...(values.description ? { description: values.description } : {}),
        ...(values.dueDate ? { dueDate: values.dueDate } : {}),
        createdAt: now,
        updatedAt: now,
      }
      let optimisticRequiresRefetch = false
      const update =
        queryClient.getQueryData<TaskPage>(queryKey) === undefined
          ? undefined
          : optimisticUpdate<TaskPage>({
              client: queryClient,
              queryKey,
              apply: (page) => {
                const result = reconcileTaskInPage(page, provisional, params, "create")
                optimisticRequiresRefetch = result.requiresRefetch
                return result.page
              },
            })
      try {
        const created = await createTaskRequest(
          httpClient,
          toCreateInput(values),
          lifecycle.current.signal,
        )
        // Swap the provisional row for the persisted one in a single cache write: dropping
        // `optimistic-N` and folding in the real row together stays correct even when the live
        // stream writes the same key between the optimistic apply and this reconcile.
        let requiresRefetch = optimisticRequiresRefetch
        if (queryClient.getQueryData<TaskPage>(queryKey) === undefined) {
          requiresRefetch = true
        } else {
          writeQueryData<TaskPage>(queryClient, queryKey, (page) => {
            const result = reconcileTaskInPage(
              dropTaskFromPage(page, provisional.id),
              created,
              params,
              "create",
            )
            requiresRefetch ||= result.requiresRefetch
            return result.page
          })
        }
        if (requiresRefetch) {
          void queryClient.invalidateQueries({ queryKey })
        }
        setError(undefined)
        return true
      } catch (cause) {
        if (update !== undefined && !update.rollback()) {
          // A newer cache write landed while this request was pending. Drop the provisional row
          // so it does not linger as a ghost in the cache.
          writeQueryData<TaskPage>(queryClient, queryKey, (page) =>
            dropTaskFromPage(page, provisional.id),
          )
          void queryClient.invalidateQueries({ queryKey })
        }
        setError(cause)
        return false
      }
    },
    [httpClient, params, queryClient, queryKey],
  )

  const edit = useCallback(
    async (task: Task, values: TaskFormValues): Promise<boolean> => {
      const optimistic: Task = {
        ...task,
        title: values.title,
        status: values.status,
        priority: values.priority,
        updatedAt: new Date().toISOString(),
      }
      if (values.description) {
        optimistic.description = values.description
      } else {
        delete optimistic.description
      }
      if (values.dueDate) {
        optimistic.dueDate = values.dueDate
      } else {
        delete optimistic.dueDate
      }
      let optimisticRequiresRefetch = false
      const update =
        queryClient.getQueryData<TaskPage>(queryKey) === undefined
          ? undefined
          : optimisticUpdate<TaskPage>({
              client: queryClient,
              queryKey,
              apply: (page) => {
                const result = reconcileTaskInPage(page, optimistic, params, "update")
                optimisticRequiresRefetch = result.requiresRefetch
                return result.page
              },
            })
      try {
        const updated = await updateTaskRequest(
          httpClient,
          task.id,
          toUpdateInput(values),
          lifecycle.current.signal,
        )
        let requiresRefetch = optimisticRequiresRefetch
        if (queryClient.getQueryData<TaskPage>(queryKey) === undefined) {
          requiresRefetch = true
        } else {
          writeQueryData<TaskPage>(queryClient, queryKey, (page) => {
            const result = reconcileTaskInPage(page, updated, params, "update")
            requiresRefetch ||= result.requiresRefetch
            return result.page
          })
        }
        if (requiresRefetch) {
          void queryClient.invalidateQueries({ queryKey })
        }
        setError(undefined)
        return true
      } catch (cause) {
        if (update !== undefined && !update.rollback()) {
          // A newer cache write landed while this request was pending. Reconcile by restoring
          // the task's pre-mutation state and invalidating so server state re-syncs.
          writeQueryData<TaskPage>(
            queryClient,
            queryKey,
            (page) => reconcileTaskInPage(page, task, params, "update").page,
          )
          void queryClient.invalidateQueries({ queryKey })
        }
        setError(cause)
        return false
      }
    },
    [httpClient, params, queryClient, queryKey],
  )

  return { create, edit, error, clearError }
}
