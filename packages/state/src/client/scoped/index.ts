"use client"

export type { Sensitivity } from "../../scope/sensitivity"
// Re-export-only barrel for the unified scoped-state surface — the callable `use`-prefixed hook.
// Both factories return the same shape (a single value is the degenerate composite); the
// host-backed scope backends live in the sibling `../scope` barrel, the neutral `memory` scope +
// serializers in `.`.
export type {
  FieldDescriptor,
  ObjectPatch,
  ScopedObjectActions,
  ScopedObjectApi,
  ScopedObjectConfig,
  ScopedObjectProviderProps,
  ScopedObjectSurface,
} from "./scoped-object"
export { createScopedObject } from "./scoped-object"
export type {
  ScopedSetter,
  ScopedStateActions,
  ScopedStateApi,
  ScopedStateConfig,
  ScopedStateProviderProps,
  ScopedStateSurface,
} from "./scoped-state"
export { createScopedState } from "./scoped-state"
