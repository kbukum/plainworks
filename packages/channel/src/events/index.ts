// Re-export-only barrel for the events concern: decode raw frames into typed events and route them
// to sinks through a bounded buffer. No logic here.
export type { EventDecoder } from "./event"
export { jsonDecoder } from "./event"
export { createEventRouter, type EventRouter, type EventRouterOptions } from "./router"
export type { EventSink } from "./sink"
export { createStateSink, type StateProjection } from "./state-sink"
