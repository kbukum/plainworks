// Re-export-only barrel for the emitter concern: one in-memory listener set shared by every
// package that fans a value out to subscribers. No logic here.
export type { Emitter, EmitterOptions } from "./emitter"
export { createEmitter } from "./emitter"
