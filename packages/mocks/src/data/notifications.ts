/**
 * Notification data factory
 */

import type { CreateNotificationInput, Notification } from "../types"
import { daysAgo } from "../utils"
import { randomBoolean, randomElement, randomInt } from "../utils/random"
import { createEntityFactory, type EntityFactory, type FixtureSources } from "./common"

const NOTIFICATION_TEMPLATES = [
  {
    type: "info" as const,
    title: "New feature available",
    message: "Check out the new dashboard features.",
  },
  {
    type: "success" as const,
    title: "Task completed",
    message: "Your task has been marked as done.",
  },
  {
    type: "warning" as const,
    title: "Subscription expiring",
    message: "Your subscription expires in 7 days.",
  },
  {
    type: "error" as const,
    title: "Payment failed",
    message: "Your last payment could not be processed.",
  },
  {
    type: "info" as const,
    title: "Team update",
    message: "A new team member has joined your project.",
  },
  {
    type: "success" as const,
    title: "Export ready",
    message: "Your data export is ready for download.",
  },
]

function createNotificationEntity(
  sources: FixtureSources,
  input?: Partial<CreateNotificationInput>,
): Notification {
  const { rng, clock, nextId } = sources
  const template = randomElement(rng, NOTIFICATION_TEMPLATES)

  return {
    id: nextId("notif"),
    userId: input?.userId || nextId("user"),
    type: input?.type || template.type,
    title: input?.title || template.title,
    message: input?.message || template.message,
    read: input?.read ?? randomBoolean(rng, 0.3),
    createdAt: daysAgo(clock, randomInt(rng, 0, 14)),
  }
}

/** Build a notification factory driven by the injected per-domain FixtureSources (seeded → reproducible). */
export function createNotificationFactory(
  sources: FixtureSources,
): EntityFactory<Notification, CreateNotificationInput> {
  return createEntityFactory<Notification, CreateNotificationInput>({
    create: (input) => createNotificationEntity(sources, input),
    defaultSeedCount: 20,
  })
}
