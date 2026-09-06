/**
 * Notification API handlers
 */

import type { Clock } from "@plainworks/std"
import type { HttpHandler } from "msw"
import type { EntityFactory, EntityStore } from "../data/common"
import type { CreateNotificationInput, Notification } from "../types"
import type { LatencyController } from "../utils/delay"
import { createCrudHandlers, type InputSpec } from "./common"

const NOTIFICATION_INPUT_SPEC: InputSpec = {
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
