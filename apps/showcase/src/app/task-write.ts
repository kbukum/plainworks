// The task write reads through their validation boundary. A create/edit posts its input and the
// mock echoes the persisted row, decoded from `unknown` and narrowed by the same {@link isTask}
// guard the list read uses — so an optimistic cache update reconciles against a trusted shape, not
// a fabricated one. Neutral and server-safe: it names no host global and every write is
// cancellable.

import type { CreateTaskInput, Task, UpdateTaskInput } from "@plainworks/demo"
import type { createHttpClient } from "@plainworks/http"
import { guardSchema, isRecord, type WebAbortSignal } from "@plainworks/std"
import { encodeIdSegment } from "./id-segment"
import { isTask } from "./task-shape"

type HttpClient = ReturnType<typeof createHttpClient>

// The mock wraps a written task in `{ data }`; the row is trusted only when it is a sound `Task`.
const taskEnvelopeSchema = guardSchema<{ readonly data: Task }>(
  (value): value is { readonly data: Task } => isRecord(value) && isTask(value.data),
  "response is not a { data: Task } envelope",
)

/** Create a task, returning the persisted row validated at the boundary; a bodyless response fails. */
export async function createTask(
  client: HttpClient,
  input: CreateTaskInput,
  signal?: WebAbortSignal,
): Promise<Task> {
  const created = await client.post("/api/tasks", {
    body: input,
    ...(signal ? { signal } : {}),
    schema: taskEnvelopeSchema,
  })
  if (created === undefined) {
    throw new Error("POST /api/tasks returned no body")
  }
  return created.data
}

/** Update a task, returning the persisted row validated at the boundary; a bodyless response fails. */
export async function updateTask(
  client: HttpClient,
  id: string,
  input: UpdateTaskInput,
  signal?: WebAbortSignal,
): Promise<Task> {
  const segment = encodeIdSegment("task", id)
  const updated = await client.patch(`/api/tasks/${segment}`, {
    body: input,
    ...(signal ? { signal } : {}),
    schema: taskEnvelopeSchema,
  })
  if (updated === undefined) {
    throw new Error(`PATCH /api/tasks/${segment} returned no body`)
  }
  return updated.data
}
