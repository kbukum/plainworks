"use client"

export type { StoreContext, StoreContextOptions, StoreProviderProps } from "./client/context"
// Client public entry for `@plainworks/state` — re-export-only barrel over the client concern
// modules (never the server `.` barrel). The per-module `"use client"` directive makes tsdown emit
// this (and only the client graph) as the `./client` entry; the server `.` entry stays clean.
export { createStoreContext } from "./client/context"
