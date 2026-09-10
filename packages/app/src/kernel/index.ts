// Re-export-only barrel for the composition kernel — the neutral half of `@plainworks/app`. No
// React or DOM here: it holds the server capability registry, resolves it, and runs the SSR
// contract as plain data. The React rendering of the kernel lives in `../client`.

export type { App, AppConfig } from "./app"
export { createApp } from "./app"
export type { AnyCapability, Awaitable, Capability, CapabilityResolveContext } from "./capability"
export { defineCapability } from "./capability"
export type { OrderedNode } from "./ordering"
export { orderCapabilities } from "./ordering"
export type { AppSnapshot } from "./snapshot"
export {
  deserializeSnapshot,
  EMPTY_SNAPSHOT,
  resolveCapabilities,
  serializeSnapshot,
  snapshotFor,
} from "./snapshot"
