// Re-export-only barrel for the time concern: the injectable clock every time-reading API takes.
export type { Clock } from "./clock"
export { fixedClock, parseTimestamp, systemClock } from "./clock"
