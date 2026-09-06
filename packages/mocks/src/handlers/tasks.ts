/**
 * Task API handlers
 */

import type { Clock } from "@plainworks/std"
import type { HttpHandler } from "msw"
import type { EntityFactory, EntityStore } from "../data/common"
import type { CreateTaskInput, Task } from "../types"
import type { LatencyController } from "../utils/delay"
import { createCrudHandlers, type InputSpec } from "./common"

const TASK_INPUT_SPEC: InputSpec = {
  title: { kind: "string" },
  description: { kind: "string" },
  status: { kind: "enum", values: ["todo", "in-progress", "done", "blocked"] },
  priority: { kind: "enum", values: ["low", "medium", "high"] },
  assigneeId: { kind: "string" },
  dueDate: { kind: "string" },
  tags: { kind: "stringArray" },
}

/** Build the `/api/tasks` CRUD handlers against this server's store. */
export function createTaskHandlers(
  factory: EntityFactory<Task, CreateTaskInput>,
  store: EntityStore<Task>,
  latency: LatencyController,
  clock: Clock,
): HttpHandler[] {
  return createCrudHandlers<Task, CreateTaskInput>({
    basePath: "/api/tasks",
    entityName: "Task",
    store,
    createEntity: factory.create,
    latency,
    clock,
    inputSpec: TASK_INPUT_SPEC,
    searchFields: ["title", "description"],
    sortFields: ["title", "status", "priority", "createdAt"],
  })
}
