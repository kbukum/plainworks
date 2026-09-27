// The host's page table: the title and one-line summary the app frame shows for each route, and
// the primary sections the navigation lists. Neutral data, so the RSC tree and the client shell
// read the same copy.

import { ACCOUNT_PATH, OVERVIEW_PATH, SIGN_IN_INTERRUPTED_PATH, TASKS_PATH } from "./constants"

/** One routed page the app frame titles and, when primary, lists in the navigation. */
export interface HostRoute {
  readonly id: "overview" | "tasks" | "account" | "sign-in-interrupted"
  readonly path: string
  /** Page title, also the navigation label and the main landmark's name. */
  readonly label: string
  /** One sentence under the title that says what the page is for. */
  readonly summary: string
}

const OVERVIEW: HostRoute = {
  id: "overview",
  path: OVERVIEW_PATH,
  label: "Overview",
  summary: "A Next.js host running the same plainworks kit as the Vite showcase.",
}

const TASKS: HostRoute = {
  id: "tasks",
  path: TASKS_PATH,
  label: "Tasks",
  summary: "The highest-priority tasks, rendered on the server and kept fresh in the browser.",
}

const ACCOUNT: HostRoute = {
  id: "account",
  path: ACCOUNT_PATH,
  label: "Account settings",
  summary: "Manage the account you are signed in with.",
}

const SIGN_IN_INTERRUPTED: HostRoute = {
  id: "sign-in-interrupted",
  path: SIGN_IN_INTERRUPTED_PATH,
  label: "Sign-in interrupted",
  summary: "The sign-in did not finish, so you are still signed out.",
}

/** The primary sections, in navigation order. Account settings live in the account menu. */
export const HOST_NAVIGATION: readonly HostRoute[] = [OVERVIEW, TASKS]

const ROUTES: readonly HostRoute[] = [OVERVIEW, TASKS, ACCOUNT, SIGN_IN_INTERRUPTED]

/** The route a pathname renders, ignoring a trailing slash, or `undefined` when none matches. */
export function hostRouteFor(pathname: string): HostRoute | undefined {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname
  return ROUTES.find((route) => route.path === path)
}
