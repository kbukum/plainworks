// Server-safe public entry for `@plainworks/state` — re-export-only barrel (no logic here; the
// implementation lives in concern modules). No React or DOM imports, so the `.` entry runs anywhere
// (Node, edge, RSC); the interactive Provider + selector hooks live under `./client`.
export type { StateCapabilities, StateSerializer, StateSource } from "@plainworks/std"
export type { StateFieldFailure, StateSourceErrorOptions } from "./errors"
export { StateConfigError, StateError, StateSourceError } from "./errors"
export type { StoreDefinition, StoreShape } from "./facade"
export { createSelector, defineStore } from "./facade"
export type { Scope, SourceSpec } from "./scope"
export { jsonSerializer, memoryScope, stringSerializer } from "./scope"
export type { Sensitivity } from "./scope/sensitivity"
export { assertScopeAllowsSensitivity, isMemoryEquivalent } from "./scope/sensitivity"
export type { StateAdapter } from "./seam"
export { toAdapter } from "./seam"
export type { StatePatch, Store, StoreInitializer, StoreSet } from "./store"
export { createStore } from "./store"
