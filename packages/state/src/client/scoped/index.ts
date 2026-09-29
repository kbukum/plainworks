"use client"

// Re-export-only barrel for the unified scoped-state surface — the callable `use`-prefixed hook.
// Both factories return the same shape (a single value is the degenerate composite). The neutral
// `memory` scope, the serializers, and `Sensitivity` live in `.`; the host-backed scopes live on
// the adapter subpaths.
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
