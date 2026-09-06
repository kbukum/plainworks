"use client"

// Client public entry for `@plainworks/state` — re-export-only barrel over the default-engine client
// concern modules (never the server `.` barrel). The per-module `"use client"` directive makes tsdown
// emit this (and only the client graph) as the `./client` entry; the server `.` entry stays clean.
// The bring-your-own-store binding lives at the engine-free `./client/supplied` subpath.
export type { StoreContext, StoreContextOptions, StoreProviderProps } from "./client/context"
export { createStoreContext } from "./client/context"
