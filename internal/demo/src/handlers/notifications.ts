/**
 * Notification API handlers
 */

import type {
  EntityFactory,
  EntityStore,
  LatencyController,
  MutationAuthorizer,
} from "@plainworks/mocks"
import { createCrudHandlers, type InputSpec } from "@plainworks/mocks"
import type { Clock } from "@plainworks/std"
import { type HttpHandler, HttpResponse, http } from "msw"
import type { CreateNotificationInput, Notification } from "../types"

const NOTIFICATION_INPUT_SPEC: InputSpec<CreateNotificationInput> = {
  userId: { kind: "string" },
  type: { kind: "enum", values: ["info", "success", "warning", "error"] },
  title: { kind: "string" },
  message: { kind: "string" },
  read: { kind: "boolean" },
}

/**
 * Mark every notification read in one request — the bulk affordance a real inbox exposes so a
 * "mark all read" is one round-trip, not one PATCH per row. Gated by the same `authorize` seam as
 * the per-row writes, so a denied caller is answered with `403` before the store is touched.
 * Answers with the count of rows it flipped from unread to read.
 */
function createMarkAllReadHandler(
  store: EntityStore<Notification>,
  latency: LatencyController,
  authorize?: MutationAuthorizer,
): HttpHandler {
  return http.post("*/api/notifications/read-all", async ({ request }) => {
    await latency.wait(request.signal)
    if (authorize && !(await authorize(request))) {
      return HttpResponse.json({ data: null, error: "Not authorized" }, { status: 403 })
    }
    let updated = 0
    const all = store.getAll()
    for (let index = 0; index < all.length; index += 1) {
      const current = all[index]
      if (current !== undefined && !current.read) {
        store.update(index, { ...current, read: true })
        updated += 1
      }
    }
    return HttpResponse.json({ data: { updated } })
  })
}

/** Build the `/api/notifications` CRUD handlers plus the bulk mark-all-read endpoint. */
export function createNotificationHandlers(
  factory: EntityFactory<Notification, CreateNotificationInput>,
  store: EntityStore<Notification>,
  latency: LatencyController,
  clock: Clock,
  authorize?: MutationAuthorizer,
): HttpHandler[] {
  return [
    // The bulk `/read-all` endpoint and the CRUD collection use distinct paths, so registration
    // order is not load-bearing; the bulk handler is listed first to read top-down as the inbox's
    // primary affordance.
    createMarkAllReadHandler(store, latency, authorize),
    ...createCrudHandlers<Notification, CreateNotificationInput>({
      basePath: "/api/notifications",
      entityName: "Notification",
      store,
      createEntity: factory.create,
      latency,
      clock,
      inputSpec: NOTIFICATION_INPUT_SPEC,
      searchFields: ["title", "message"],
      sortFields: ["title", "type", "createdAt"],
      ...(authorize ? { authorize } : {}),
    }),
  ]
}
