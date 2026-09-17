// Neutral, host-agnostic constants shared by the server components, the BFF route handlers, and the
// client glue. Keeping them in one server-safe module (no React, no DOM, no host global) is what
// lets every bucket agree on the cookie names, the capability ids the snapshot is keyed by, the
// route paths, and the exact list request the dashboard reads.

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

/** Cookie the theme preference is persisted under so the server can render an explicit mode. */
export const THEME_COOKIE = "theme"

/** Capability id joining the neutral theme resolver to its client provider. */
export const THEME_CAPABILITY_ID = "theme"

/** Capability id joining the neutral session resolver to its client `SessionProvider`. */
export const AUTH_CAPABILITY_ID = "auth"

/** Public landing route — the overview, reachable without a session. */
export const OVERVIEW_PATH = "/"

/** Session-gated route: the query-driven task list. */
export const TASKS_PATH = "/tasks"

/** Session-gated route: the authorization-gated account panel. */
export const ACCOUNT_PATH = "/account"

/** BFF route that begins the OIDC login redirect. */
export const LOGIN_PATH = "/login"

/** BFF route the provider calls back with the authorization code. */
export const AUTH_CALLBACK_PATH = "/auth/callback"

/** BFF route that clears the session cookie. */
export const LOGOUT_PATH = "/logout"

/** Base path the mock backend route handler serves the demo domain under. */
export const API_BASE_PATH = "/api"

/** Memory-scope slot the live stream folds task upserts into. */
export const LIVE_TASKS_SLOT_KEY = "live-tasks"
