// Server-safe public entry for `@plainworks/state` — re-export-only barrel (no logic here; the
// implementation lives in concern modules). No React or DOM imports, so the `.` entry runs anywhere
// (Node, edge, RSC); the interactive Provider + selector hooks live under `./client`.
export { StateError } from "./errors"
export type { StateAdapter } from "./seam"
export { toAdapter } from "./seam"
export type { Store, StoreInitializer } from "./store"
export { createStore } from "./store"
