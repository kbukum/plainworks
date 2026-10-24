// Re-export-only barrel for the time concern: the injectable clock every time-reading API takes,
// and the fixed and manual clocks that pin or drive it.
export type { Clock } from "./clock"
export { fixedClock, parseTimestamp, systemClock } from "./clock"
export type { ManualClock } from "./manual-clock"
export { manualClock } from "./manual-clock"
export { parseRfc3339 } from "./rfc3339"
