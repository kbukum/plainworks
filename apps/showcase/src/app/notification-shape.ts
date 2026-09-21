// The `Notification` runtime shape in one server-safe place — the type vocabulary and a sound guard
// the feed read and the act-on writes both narrow through, so a malformed row can never cross as a
// typed `Notification`. Neutral: it names no host global.

import type { Notification } from "@plainworks/demo"
import { isNonEmptyString, isOneOf, isRecord } from "@plainworks/std"

/** Every notification type, in ascending severity. */
export const NOTIFICATION_TYPES: readonly Notification["type"][] = [
  "info",
  "success",
  "warning",
  "error",
]

/**
 * A sound {@link Notification} guard: required identity present, a type drawn from
 * {@link NOTIFICATION_TYPES}, a boolean read flag, and string title/message/timestamp.
 */
export function isNotification(value: unknown): value is Notification {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.userId) &&
    isOneOf(value.type, NOTIFICATION_TYPES) &&
    typeof value.title === "string" &&
    typeof value.message === "string" &&
    typeof value.read === "boolean" &&
    typeof value.createdAt === "string"
  )
}

/** How many rows are unread — the one unread tally the feed and the shell badge both derive. */
export function countUnread(rows: readonly Notification[]): number {
  return rows.reduce((unread, row) => (row.read ? unread : unread + 1), 0)
}
