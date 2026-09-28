import {
  type BrowserAxeOptions,
  findFocusProblems,
  formatAxeViolations,
  horizontalOverflow,
  scanBrowserAxe,
  settleAnimations,
  waitForHydration,
} from "@plainworks/testkit/browser"
import { expect, type Page } from "@playwright/test"

// Throwing assertions the app's functional specs use to check a single arranged moment the flow
// engine does not reach on its own — a signed-out page, a per-keyboard-stop focus sweep, a reflow
// at exactly 320 CSS px. Each is a thin layer over the public finding forms the flow engine also
// consumes, so there is one implementation of every check.

// Sub-pixel layout can round the document one pixel wider than the viewport without a scrollbar.
const OVERFLOW_SLACK_PX = 1

// The WCAG 1.4.10 target: 320 CSS px, a 1280 px desktop at 400% zoom, so media and container
// queries collapse the way they would for a user at that zoom.
const REFLOW_VIEWPORT = { width: 320, height: 640 } as const

// React has hydration up to this long before a check that depends on it should give up.
const HYDRATION_TIMEOUT_MS = 15_000

/**
 * Assert React has hydrated the page's `main` landmark. Server markup is visible before it
 * hydrates, so an interaction or check can otherwise run too early.
 */
export async function expectHydrated(page: Page): Promise<void> {
  expect(await waitForHydration(page, HYDRATION_TIMEOUT_MS), "the main landmark is hydrated").toBe(
    true,
  )
}

/** Assert axe finds no WCAG 2.2 AA violation, failing with one actionable line per violation. */
export async function expectNoAxeViolations(
  page: Page,
  options: BrowserAxeOptions = {},
): Promise<void> {
  const violations = await scanBrowserAxe(page, options)
  expect(
    violations,
    `Expected no WCAG 2.2 AA violations:\n${formatAxeViolations(violations)}`,
  ).toEqual([])
}

/**
 * Assert the focused control shows a visible, unobscured focus indicator (WCAG 2.4.7 / 2.4.11).
 * Polls, because a component may mark its focus a render after the focus event.
 */
export async function expectFocusVisible(page: Page): Promise<void> {
  await expect
    .poll(() => findFocusProblems(page), {
      message: "focused control shows a visible, unobscured focus indicator",
    })
    .toEqual([])
}

/**
 * Assert the page reflows at 320 CSS px with no horizontal scrolling. Uses a real narrow viewport,
 * not CSS zoom, so queries collapse as they would at 400% zoom, and restores the original size.
 */
export async function expectReflow(page: Page): Promise<void> {
  const original = page.viewportSize()
  try {
    await page.setViewportSize(REFLOW_VIEWPORT)
    // Controls that resize with their container transition to the narrow layout; measure the end.
    await settleAnimations(page)
    const overflow = await horizontalOverflow(page)
    expect(
      overflow,
      `${page.url()} scrolls ${overflow}px sideways at 320 CSS px (WCAG 1.4.10 reflow)`,
    ).toBeLessThanOrEqual(OVERFLOW_SLACK_PX)
  } finally {
    if (original) await page.setViewportSize(original)
  }
}
