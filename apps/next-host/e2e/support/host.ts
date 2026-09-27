import { BROWSER_GATE_NOW, type VisualCapture } from "@plainworks/testkit/browser"
import { expect, type Locator, type Page } from "@playwright/test"

/**
 * A full-page capture of a page: the devtools chrome is `position: fixed`, so the capture hides it
 * rather than paint it mid-image. The `-viewport` surfaces show it where a user sees it.
 */
export const PAGE_CAPTURE: VisualCapture = {
  kind: "full-page",
  hideFixed: ["[data-plainworks-devtools]"],
}

/** One routed page of the Next host and the content that proves it rendered. */
export interface HostRoute {
  /** A lowercase slug that names the page's baselines. */
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

/** Open `route`, wait for its content, and pause the live feed. */
export async function openRoute(page: Page, route: HostRoute): Promise<void> {
  await page.goto(route.path)
  await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible()
  await expect(route.ready(page)).toBeVisible()
  await pauseLiveActivity(page)
}

/**
 * Open `route` for a screenshot and hold it still. Pausing the feed stops only the page's list: the
 * demo stream keeps delivering frames on a real timer, and the devtools rail and inspector count
 * each one. So once the feed is paused the page's timers stop too, and `open` brings up any overlay
 * on the held clock. A frame that landed first shows on the rail, and the page is reloaded until
 * the capture starts before the stream's first frame. Pair it with a surface that sets
 * `holdsClock`, so the run resumes the clock for the axe scan.
 */
export async function openStillRoute(
  page: Page,
  route: HostRoute,
  open?: (page: Page) => Promise<void>,
): Promise<void> {
  // Read by attribute, not role: a modal overlay hides the rail from the accessibility tree.
  const liveTasks = page.locator('[data-plainworks-devtools] button[aria-label^="Live tasks:"]')
  await expect(async () => {
    await page.clock.resume()
    await openRoute(page, route)
    await page.clock.pauseAt(new Date(BROWSER_GATE_NOW))
    await open?.(page)
    await expect(liveTasks).toHaveAttribute("aria-label", "Live tasks: open", { timeout: 1_000 })
  }).toPass({ timeout: 60_000 })
}
