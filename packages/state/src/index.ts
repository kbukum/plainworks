// Server-safe public entry for `@plainworks/state` — re-export-only barrel (no logic here; the
// implementation lives in concern modules). No React or DOM imports, so the `.` entry runs anywhere
// (Node, edge, RSC); the interactive Provider + selector hooks live under `./client`.
export { StateConfigError, StateError } from "./errors"
export type { StoreDefinition, StoreShape } from "./facade"
export { createSelector, defineStore } from "./facade"
export type { StateAdapter } from "./seam"
export { toAdapter } from "./seam"
export type { StatePatch, Store, StoreInitializer, StoreSet } from "./store"
export { createStore } from "./store"
