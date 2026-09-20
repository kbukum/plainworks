/**
 * Task API handlers
 */

import type { EntityFactory, EntityStore, LatencyController } from "@plainworks/mocks"
import { createCrudHandlers, type InputSpec } from "@plainworks/mocks"
import type { Clock } from "@plainworks/std"
import type { HttpHandler } from "msw"
import {
  type CreateTaskInput,
  TASK_PRIORITIES,
  type Task,
  taskPriorityRank,
  type UpdateTaskInput,
} from "../types"

const TASK_CREATE_INPUT_SPEC: InputSpec<CreateTaskInput> = {
  title: { kind: "string" },
  description: { kind: "string" },
  status: { kind: "enum", values: ["todo", "in-progress", "done", "blocked"] },
  priority: { kind: "enum", values: TASK_PRIORITIES },
  assigneeId: { kind: "string" },
  dueDate: { kind: "string" },
  tags: { kind: "stringArray" },
}

const TASK_UPDATE_INPUT_SPEC: InputSpec<UpdateTaskInput> = {
  ...TASK_CREATE_INPUT_SPEC,
  description: { kind: "string", nullable: true },
  assigneeId: { kind: "string", nullable: true },
  dueDate: { kind: "string", nullable: true },
}

/** Build the `/api/tasks` CRUD handlers against this server's store. */
export function createTaskHandlers(
  factory: EntityFactory<Task, CreateTaskInput>,
  store: EntityStore<Task>,
  latency: LatencyController,
  clock: Clock,
): HttpHandler[] {
  return createCrudHandlers<Task, CreateTaskInput, UpdateTaskInput>({
    basePath: "/api/tasks",
    entityName: "Task",
    store,
    createEntity: factory.create,
    latency,
    clock,
    inputSpec: TASK_CREATE_INPUT_SPEC,
    updateInputSpec: TASK_UPDATE_INPUT_SPEC,
    searchFields: ["title", "description"],
    filterFields: ["title", "status", "priority", "assigneeId", "dueDate"],
    sortFields: ["title", "status", "priority", "createdAt"],
    sortComparators: {
      priority: (a, b) => taskPriorityRank(a) - taskPriorityRank(b),
    },
  })
}
