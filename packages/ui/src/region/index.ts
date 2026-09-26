// Re-export-only barrel for async-region view logic: the pure, host-neutral rule for which state
// a region shows. The client `AsyncState` renders it.
export type { AsyncFlags, AsyncStatus } from "./async-status"
export { asyncStatus } from "./async-status"
