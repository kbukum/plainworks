"use client"

import type { QueryClient } from "@plainworks/query"
import { createRemoteSource } from "@plainworks/query/remote"
import { jsonSerializer } from "@plainworks/state"
import { cookieScope } from "@plainworks/state/cookie"
import type { StateSource } from "@plainworks/std/seam"
import type { ThemePreference } from "@plainworks/theme/preference"
import { LIVE_TASKS_SLOT_KEY, THEME_COOKIE } from "../../neutral/constants"
import type { LiveTasks } from "../live"

/**
 * Build the theme's backing {@link StateSource} — a non-secret, client-readable cookie the server
 * also reads for a persisted explicit-mode first paint. Host access is deferred to the first
 * read/write, so building it during SSR touches no `document`. Per-request factory, no module
 * singleton.
 */
export function createThemeSource(): StateSource<ThemePreference> {
  return cookieScope.createSource<ThemePreference>({
    key: THEME_COOKIE,
    serializer: jsonSerializer<ThemePreference>(),
  })
}

/** Build the transient in-memory slot the live stream folds task upserts into (server-safe scope). */
export function createLiveTasksSource(client: QueryClient): StateSource<LiveTasks> {
  return createRemoteSource<LiveTasks>(client, [LIVE_TASKS_SLOT_KEY])
}
