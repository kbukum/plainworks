import type { VisualCapture } from "@plainworks/testkit/browser"
import { expect, type Locator, type Page } from "@playwright/test"

/**
 * A full-page capture of a page: the devtools chrome is `position: fixed`, so the capture hides it
 * rather than paint it mid-image. The `-viewport` surfaces show it where a user sees it.
 */
export const PAGE_CAPTURE: VisualCapture = {
  kind: "full-page",
  hideFixed: ["[data-plainworks-devtools]"],
}

/** One routed page of the showcase and the content that proves it rendered. */
export interface AppRoute {
  /** A lowercase slug that names the page's baselines. */
  readonly slug: string
  readonly path: string
  /** The level-one heading. */
  readonly heading: string
  /** The primary navigation link that reaches the page. */
  readonly nav: string
  readonly ready: (page: Page) => Locator
}

/** Every routed page, including each settings panel. */
export const APP_ROUTES: readonly AppRoute[] = [
  {
    slug: "overview",
    path: "/",
    heading: "Overview",
    nav: "Overview",
    ready: (page) => page.getByText("Revenue trend", { exact: true }),
  },
  {
    slug: "tasks",
    path: "/tasks",
    heading: "Tasks",
    nav: "Tasks",
    ready: (page) => page.getByRole("table", { name: /Tasks/ }),
  },
  {
    slug: "orders",
    path: "/orders",
    heading: "Orders",
    nav: "Orders",
    ready: (page) => page.getByRole("table", { name: /Orders/ }),
  },
  {
    slug: "products",
    path: "/products",
    heading: "Products",
    nav: "Products",
    ready: (page) => page.getByRole("list", { name: "Product results" }),
  },
  {
    slug: "users",
    path: "/users",
    heading: "Users",
    nav: "Users",
    ready: (page) => page.getByRole("table", { name: /Users/ }),
  },
  {
    slug: "notifications",
    path: "/notifications",
    heading: "Notifications",
    nav: "Notifications",
    ready: (page) => page.getByRole("list", { name: "Notifications" }),
  },
  {
    slug: "settings-profile",
    path: "/settings",
    heading: "Settings",
    nav: "Settings",
    ready: (page) => page.getByLabel("Display name"),
  },
  {
    slug: "settings-preferences",
    path: "/settings/preferences",
    heading: "Settings",
    nav: "Settings",
    ready: (page) => page.getByLabel("Rows per page"),
  },
  {
    slug: "settings-notifications",
    path: "/settings/notifications",
    heading: "Settings",
    nav: "Settings",
    ready: (page) => page.getByRole("switch", { name: "Email" }),
  },
  {
    slug: "settings-appearance",
    path: "/settings/appearance",
    heading: "Settings",
    nav: "Settings",
    ready: (page) => page.getByRole("radiogroup", { name: "Motion" }),
  },
]

/** The route with `slug`. Throws for an unknown slug, which is a typo in the spec. */
export function appRoute(slug: string): AppRoute {
  const route = APP_ROUTES.find((candidate) => candidate.slug === slug)
  if (route === undefined) throw new RangeError(`Unknown showcase route: ${slug}`)
  return route
}

/** Load `route` from the server and wait until its content has rendered. */
export async function openRoute(page: Page, route: AppRoute): Promise<void> {
  await page.goto(route.path)
  await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible()
  await expect(route.ready(page)).toBeVisible()
  await page.waitForLoadState("networkidle")
}

/**
 * Reach `route` through the app's own navigation: the primary rail when it is visible, the sections
 * drawer otherwise. The page must already be hydrated.
 */
export async function navigateTo(page: Page, route: AppRoute): Promise<void> {
  const rail = page.getByRole("navigation", { name: "Primary" })
  if (await rail.isVisible()) {
    await rail.getByRole("link", { name: route.nav, exact: true }).click()
    return
  }
  await page.getByRole("button", { name: "Open sections menu" }).click()
  await page
    .getByRole("navigation", { name: "Sections" })
    .getByRole("link", { name: route.nav, exact: true })
    .click()
}

/**
 * Open the task board with its live updates paused, before any live update lands, so the table
 * shows only seeded tasks. The demo stream's first update comes a few seconds after hydration; if
 * it wins the race, the page reloads and tries again.
 */
export async function openPausedTasks(page: Page): Promise<void> {
  const pause = page.getByRole("button", { name: "Pause live task updates" })
  const resume = page.getByRole("button", { name: "Resume live task updates" })
  // Live task titles end in their sequence number; seeded ones never do.
  const liveTask = page.getByRole("cell", { name: / #\d+$/ })
  await expect(async () => {
    await openRoute(page, appRoute("tasks"))
    // A click before hydration does nothing, so retry it until the toggle answers.
    await expect(async () => {
      await pause.click()
      await expect(resume).toBeVisible({ timeout: 500 })
    }).toPass({ timeout: 10_000 })
    await expect(liveTask).toHaveCount(0, { timeout: 0 })
  }).toPass({ timeout: 45_000 })
}
