import type { Severity, SourceId } from "../protocol"
import { sourceIdEquals } from "../protocol"
import type { RetentionEntry } from "../retention"

/** Timeline filter: every absent field matches everything. */
export interface EventFilter {
  /** Restrict to one source instance. */
  readonly source?: SourceId
  /** Restrict to one severity. */
  readonly severity?: Severity
  /** Case-insensitive substring match on the event kind. */
  readonly kind?: string
}

/**
 * Filter retained timeline entries for display. Pure and allocation-light: with no active filter
 * fields the input array is returned as-is, so an unfiltered timeline never copies.
 */
export function filterEvents(
  events: readonly RetentionEntry[],
  filter: EventFilter,
): readonly RetentionEntry[] {
  const kind = filter.kind?.trim().toLowerCase()
  if (filter.source === undefined && filter.severity === undefined && !kind) return events
  return events.filter((entry) => {
    if (filter.source !== undefined && !sourceIdEquals(entry.id, filter.source)) return false
    if (filter.severity !== undefined && entry.event.severity !== filter.severity) return false
    if (kind && !entry.event.kind.toLowerCase().includes(kind)) return false
    return true
  })
}
