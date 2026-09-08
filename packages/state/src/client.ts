"use client"

// Client public entry for `@plainworks/state` — re-export-only barrel over the **DOM-free** client
// concern modules (the scoped-state hooks + the store binding), never the server `.` barrel.
// Keeping this entry DOM-free is deliberate: it is the React-without-DOM bucket (React
// Native/Expo), so the host-backed *scope backends* (Web Storage, cookie, URL — which touch
// `window`/`document`) live at the separate DOM-only `./client/scope` subpath, not here. The
// per-module `"use client"` directive makes tsdown emit this (and only the client graph) as the
// `./client` entry; the server `.` entry stays clean. The bring-your-own-store binding lives at the
// engine-free `./client/supplied` subpath.
export type { StoreContext, StoreContextOptions, StoreProviderProps } from "./client/context"
export { createStoreContext } from "./client/context"
export * from "./client/scoped"
