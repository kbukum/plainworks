"use client"

// Engine-neutral bring-your-own-store subpath. It re-exports **only** the binding module, which
// imports no default engine (`createStore`/`zustand`), so `@plainworks/state/client/supplied` loads
// zero default-engine code even in a bundler-free native-ESM host where tree-shaking cannot help.
// The full `./client` entry keeps the default-engine `createStoreContext`.
export type { SuppliedStoreContext, SuppliedStoreProviderProps } from "./binding"
export { createSuppliedStoreContext } from "./binding"
