import { expect, type Page } from "@playwright/test"
import { settleAnimations } from "./animation"
import type { BrowserAxeOptions } from "./axe"
import { formatAxeViolations, scanBrowserAxe } from "./axe"
import { findFocusProblems } from "./focus"
import { waitForHydration } from "./hydration"
import { horizontalOverflow } from "./layout"

// Throwing assertions for a single moment the flows do not reach, such as a menu opened mid-test.
// Each is a thin layer over a finding form the flow engine also consumes, so every check has one
// implementation.

const OVERFLOW_SLACK_PX = 1
const REFLOW_VIEWPORT = { width: 320, height: 640 } as const
const HYDRATION_TIMEOUT_MS = 15_000

/** Assert React has hydrated the page's main landmark. */
export async function expectPageHydrated(page: Page): Promise<void> {
  expect(await waitForHydration(page, HYDRATION_TIMEOUT_MS), "the main landmark is hydrated").toBe(
    true,
  )
}

/** Assert axe finds no WCAG 2.2 AA violation. */
export async function expectNoPageAxeViolations(
  page: Page,
  options: BrowserAxeOptions = {},
): Promise<void> {
  const violations = await scanBrowserAxe(page, options)
  expect(
    violations,
    `Expected no WCAG 2.2 AA violations:\n${formatAxeViolations(violations)}`,
  ).toEqual([])
}

/** Assert the focused control has a visible, unobscured focus indicator. */
export async function expectPageFocusVisible(page: Page): Promise<void> {
  await expect
    .poll(() => findFocusProblems(page), {
      message: "focused control shows a visible, unobscured focus indicator",
    })
    .toEqual([])
}

/** Assert the page reflows at the WCAG 1.4.10 320 CSS-pixel target. */
export async function expectPageReflow(page: Page): Promise<void> {
  const original = page.viewportSize()
  try {
    await page.setViewportSize(REFLOW_VIEWPORT)
    await settleAnimations(page)
    const overflow = await horizontalOverflow(page)
    expect(
      overflow,
      `${page.url()} scrolls ${overflow}px sideways at 320 CSS px (WCAG 1.4.10 reflow)`,
    ).toBeLessThanOrEqual(OVERFLOW_SLACK_PX)
  } finally {
    if (original !== null) await page.setViewportSize(original)
  }
}
