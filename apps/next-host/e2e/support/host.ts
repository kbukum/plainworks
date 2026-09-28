import { expect, type Locator, type Page } from "@playwright/test"

/** One routed page of the Next host and the content that proves it rendered. */
export interface HostRoute {
  /** A lowercase slug that names the page's checkpoint. */
  readonly slug: string
  readonly path: string
  /** The level-one heading, which the app frame takes from the page table. */
  readonly heading: string
  readonly ready: (page: Page) => Locator
}

/** Every routed page. */
export const HOST_ROUTES: readonly HostRoute[] = [
  {
    slug: "overview",
    path: "/",
    heading: "Overview",
    ready: (page) => page.getByRole("heading", { name: "One kit, two hosts" }),
  },
  {
    slug: "tasks",
    path: "/tasks",
    heading: "Tasks",
    ready: (page) => page.getByRole("table", { name: "Tasks, highest priority first" }),
  },
  {
    slug: "account",
    path: "/account",
    heading: "Account settings",
    ready: (page) => page.getByRole("heading", { name: "Profile" }),
  },
  {
    slug: "sign-in-interrupted",
    path: "/auth/interrupted",
    heading: "Sign-in interrupted",
    ready: (page) => page.getByRole("alert").getByText("Sign-in didn't finish"),
  },
]

/** The route with `slug`. Throws for an unknown slug, so a typo fails at collection. */
export function hostRoute(slug: string): HostRoute {
  const route = HOST_ROUTES.find((candidate) => candidate.slug === slug)
  if (route === undefined) throw new RangeError(`Unknown host route "${slug}"`)
  return route
}

/**
 * Pause the live-activity feed before its first update. The demo stream emits on a real timer, so
 * a page that received an update is reloaded until the pause wins, which leaves every page in one
 * deterministic state.
 */
export async function pauseLiveActivity(page: Page): Promise<void> {
  const waiting = page.getByText("Waiting for the first streamed update…")
  await expect(async () => {
    if (!(await waiting.isVisible())) await page.reload()
    await page.getByRole("button", { name: "Pause updates" }).click({ timeout: 5_000 })
    await expect(page.getByRole("button", { name: "Resume updates" })).toBeVisible()
    await expect(waiting).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 30_000 })
}

/**
 * Open `route`, wait for its content, and pause the live feed. A flow step passes its action's
 * `signal`, so a timed-out step stops navigating.
 */
export async function openRoute(page: Page, route: HostRoute, signal?: AbortSignal): Promise<void> {
  await page.goto(route.path, signal === undefined ? {} : { signal })
  await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible()
  await expect(route.ready(page)).toBeVisible()
  await pauseLiveActivity(page)
}
