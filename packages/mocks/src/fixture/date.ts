/**
 * Date helpers. Every function takes an explicit `Clock` (the `@plainworks/std` seam) so fixture
 * timestamps are deterministic when a test injects a fixed clock instead of reading the wall
 * clock directly.
 */

import type { Clock } from "@plainworks/std"

/** Current time as an ISO timestamp. */
export function nowISOString(clock: Clock): string {
  return new Date(clock.now()).toISOString()
}

/** ISO timestamp `days` before now. */
export function daysAgo(clock: Clock, days: number): string {
  return new Date(clock.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

/** ISO timestamp `days` after now. */
export function daysFromNow(clock: Clock, days: number): string {
  return new Date(clock.now() + days * 24 * 60 * 60 * 1000).toISOString()
}

/** Format a date as e.g. "Jan 15, 2024". */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}
