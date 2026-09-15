// Neutral, host-agnostic constants shared by the server render and the client hydration. Keeping
// them in one server-safe module is what lets the two halves agree on the cookie name, the DOM ids
// the snapshot and dehydrated cache are embedded under, and the exact list request — the contract
// that makes hydration match.

import type { ListQueryParams } from "@plainworks/query"

/** Resource name the tasks list query key is scoped to. */
export const TASKS_RESOURCE = "tasks"

/** The one list request the dashboard reads — server-prefetched and client-hydrated under one key. */
export const TASK_LIST_PARAMS: ListQueryParams = {
  page: 1,
  pageSize: 8,
  sortBy: "priority",
  order: "desc",
}

/** Cookie the theme preference is persisted under; read on the server for a zero-flash first paint. */
export const THEME_COOKIE = "theme"

/** Capability id joining the neutral theme resolver to its client provider. */
export const THEME_CAPABILITY_ID = "theme"

/** Capability id joining the neutral session resolver to its client `SessionProvider`. */
export const AUTH_CAPABILITY_ID = "auth"

/** BFF route that begins the OIDC login redirect. */
export const LOGIN_PATH = "/login"

/** BFF route the provider calls back with the authorization code. */
export const AUTH_CALLBACK_PATH = "/auth/callback"

/** BFF route that clears the session cookie. */
export const LOGOUT_PATH = "/logout"

/** DOM id of the `<script>` carrying the serialized {@link AppSnapshot}. */
export const SNAPSHOT_SCRIPT_ID = "__PLAINWORKS_SNAPSHOT__"

/** DOM id of the `<script>` carrying the dehydrated query cache. */
export const QUERY_STATE_SCRIPT_ID = "__PLAINWORKS_QUERY__"

/** Memory-scope slot the live stream folds task upserts into. */
export const LIVE_TASKS_SLOT_KEY = "live-tasks"

/** Root element id the app mounts into. */
export const ROOT_ELEMENT_ID = "root"
