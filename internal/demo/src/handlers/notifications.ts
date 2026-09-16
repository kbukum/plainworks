/**
 * Notification API handlers
 */

import type { EntityFactory, EntityStore, LatencyController } from "@plainworks/mocks"
import { createCrudHandlers, type InputSpec } from "@plainworks/mocks"
import type { Clock } from "@plainworks/std"
import type { HttpHandler } from "msw"
import type { CreateNotificationInput, Notification } from "../types"

const NOTIFICATION_INPUT_SPEC: InputSpec<CreateNotificationInput> = {
  userId: { kind: "string" },
  type: { kind: "enum", values: ["info", "success", "warning", "error"] },
  title: { kind: "string" },
  message: { kind: "string" },
  read: { kind: "boolean" },
}

/** Build the `/api/notifications` CRUD handlers against this server's store. */
export function createNotificationHandlers(
  factory: EntityFactory<Notification, CreateNotificationInput>,
  store: EntityStore<Notification>,
  latency: LatencyController,
  clock: Clock,
): HttpHandler[] {
  return createCrudHandlers<Notification, CreateNotificationInput>({
    basePath: "/api/notifications",
    entityName: "Notification",
    store,
    createEntity: factory.create,
    latency,
    clock,
    inputSpec: NOTIFICATION_INPUT_SPEC,
    searchFields: ["title", "message"],
    sortFields: ["title", "type", "createdAt"],
  })
}
