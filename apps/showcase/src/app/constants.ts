// Neutral, host-agnostic constants shared by the server render and the client hydration. Keeping
// them in one server-safe module is what lets the two halves agree on the cookie name, the DOM ids
// the snapshot and dehydrated cache are embedded under, and the exact list request — the contract
// that makes hydration match.

import type { ListQueryParams } from "@plainworks/query"

/** Resource name the tasks list query key is scoped to. */
export const TASKS_RESOURCE = "tasks"

/** Resource name the orders list query key is scoped to. */
export const ORDERS_RESOURCE = "orders"

/** Resource name the products list query key is scoped to. */
export const PRODUCTS_RESOURCE = "products"

/** Resource name the users directory query key is scoped to. */
export const USERS_RESOURCE = "users"

/** Resource name the notifications feed query key is scoped to. */
export const NOTIFICATIONS_RESOURCE = "notifications"

/** Non-simple request header required on notification mutations to prevent cross-origin form POSTs. */
export const NOTIFICATION_MUTATION_HEADER = "x-plainworks-showcase-mutation"

/** Expected proof value for {@link NOTIFICATION_MUTATION_HEADER}. */
export const NOTIFICATION_MUTATION_HEADER_VALUE = "notification"

/** The initial Tasks list request — server-prefetched and client-hydrated under one key. */
export const TASK_LIST_PARAMS: ListQueryParams = {
  page: 1,
  pageSize: 8,
  sortBy: "priority",
  order: "desc",
}

/** The recent-activity request the Overview reads — the newest tasks, most recent first. */
export const RECENT_ACTIVITY_PARAMS: ListQueryParams = {
  page: 1,
  pageSize: 5,
  sortBy: "createdAt",
  order: "desc",
}

/** The initial Orders list request — newest first, with status facet counts. */
export const ORDER_LIST_PARAMS: ListQueryParams = {
  page: 1,
  pageSize: 8,
  sortBy: "createdAt",
  order: "desc",
  facets: ["status"],
}

/** The initial Products list request — newest first, with category and status facet counts. */
export const PRODUCT_LIST_PARAMS: ListQueryParams = {
  page: 1,
  pageSize: 12,
  sortBy: "createdAt",
  order: "desc",
  facets: ["category", "status"],
}

/** The initial Users directory request — alphabetical, with role/status/department facet counts. */
export const USER_LIST_PARAMS: ListQueryParams = {
  page: 1,
  pageSize: 10,
  sortBy: "name",
  order: "asc",
  facets: ["role", "status", "department"],
}

/**
 * The notifications feed request — newest first, one page sized to hold the whole inbox. The feed
 * reads a single page so the all/unread split and the shell's unread badge derive from one cached
 * list rather than a second source of truth.
 */
export const NOTIFICATION_LIST_PARAMS: ListQueryParams = {
  page: 1,
  pageSize: 50,
  sortBy: "createdAt",
  order: "desc",
}

/** Query key the Overview summary statistics are cached under. */
export const OVERVIEW_STATS_KEY = ["overview", "stats"] as const

/** Query key the Overview revenue trend is cached under. */
export const REVENUE_TREND_KEY = ["overview", "revenue"] as const

/** Days of revenue history the Overview trend visual plots. */
export const REVENUE_TREND_DAYS = 14

/** Cookie the theme preference is persisted under so the server can render an explicit mode. */
export const THEME_COOKIE = "theme"

/**
 * Base name of the signed session cookie. `createServerSession` stores it with the `__Host-`
 * prefix, so the browser cookie is {@link SESSION_COOKIE}. Pinned here so the auth composition and
 * the server-side mutation authorizer agree on one name.
 */
export const SESSION_COOKIE_NAME = "session"

/** The signed session cookie as written to the browser — `__Host-`-prefixed, secure-by-default. */
export const SESSION_COOKIE = `__Host-${SESSION_COOKIE_NAME}`

/**
 * Locale the display value components format numbers and dates with, fixed for SSR/client parity.
 */
export const DISPLAY_LOCALE = "en-US"

/** Time zone the display value components format dates in, fixed so SSR and hydration agree. */
export const DISPLAY_TIME_ZONE = "UTC"

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

/** Root element id the app mounts into. */
export const ROOT_ELEMENT_ID = "root"
