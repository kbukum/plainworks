"use client"

import { jsonSerializer } from "@plainworks/state"
import { cookieScope } from "@plainworks/state/cookie"
import type { StateSource } from "@plainworks/std/seam"
import type { ThemePreference } from "@plainworks/theme/preference"
import { THEME_COOKIE } from "../app/constants"

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
