"use client"

// Client public entry for `@plainworks/state` — re-export-only barrel over the React bindings:
// the default-engine store context, the bring-your-own-store context, and the scoped-state hooks.
// It is React-without-DOM, so it runs on React Native/Expo as well as in the browser. The DOM scope
// backends ship on their own adapter subpaths (`./web-storage`, `./cookie`, `./url`), never here.
export type { SuppliedStoreContext, SuppliedStoreProviderProps } from "./client/binding"
export { createSuppliedStoreContext } from "./client/binding"
export type { StoreContext, StoreContextOptions, StoreProviderProps } from "./client/context"
export { createStoreContext } from "./client/context"
export type {
  FieldDescriptor,
  ObjectPatch,
  ScopedObjectActions,
  ScopedObjectApi,
  ScopedObjectConfig,
  ScopedObjectProviderProps,
  ScopedObjectSurface,
  ScopedSetter,
  ScopedStateActions,
  ScopedStateApi,
  ScopedStateConfig,
  ScopedStateProviderProps,
  ScopedStateSurface,
} from "./client/scoped"
export { createScopedObject, createScopedState } from "./client/scoped"
