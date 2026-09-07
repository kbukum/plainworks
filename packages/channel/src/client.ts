"use client"

// Client public entry for `@plainworks/channel` — re-export-only barrel over the **DOM-free** React
// binding (the channel Provider + status/event hooks). Never re-exports the server `.` barrel. The
// per-module `"use client"` directive makes tsdown emit this (and only the client graph) as the
// `./client` entry, keeping the neutral `.` entry clean. It is the React-without-DOM bucket, so it
// runs in the browser, a Next client tree, and React Native alike.
export type { ChannelContext, ChannelProviderProps } from "./client/context"
export { createChannelContext } from "./client/context"
