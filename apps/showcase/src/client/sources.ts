"use client"

import { jsonSerializer, memoryScope } from "@plainworks/state"
import { cookieScope } from "@plainworks/state/client/scope"
import type { StateSource } from "@plainworks/std"
import type { ThemePreference } from "@plainworks/theme"
import { LIVE_TASKS_SLOT_KEY, THEME_COOKIE } from "../app/constants"
import type { LiveTasks } from "./live-stream"

/**
 * Build the theme's backing {@link StateSource} — a non-secret, client-readable cookie the server
 * also reads for the zero-flash first paint. Host access is deferred to the first read/write, so
 * building it during SSR touches no `document`. Per-request factory, no module singleton.
 */
export function createThemeSource(): StateSource<ThemePreference> {
  return cookieScope.createSource<ThemePreference>({
    key: THEME_COOKIE,
    serializer: jsonSerializer<ThemePreference>(),
  })
}

/** Build the transient in-memory slot the live stream folds task upserts into (server-safe scope). */
export function createLiveTasksSource(): StateSource<LiveTasks> {
  return memoryScope.createSource<LiveTasks>({
    key: LIVE_TASKS_SLOT_KEY,
    serializer: jsonSerializer<LiveTasks>(),
  })
}
