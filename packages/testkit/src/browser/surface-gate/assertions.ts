import { expect, type Page } from "@playwright/test"
import { settleAnimations } from "../checks/animation"
import { type BrowserAxeOptions, formatAxeViolations, scanBrowserAxe } from "../checks/axe"
import { findFocusProblems } from "../checks/focus"
import { countUnhydrated } from "../checks/hydration"
import { findOverlaysOutsideViewport, horizontalOverflow } from "../checks/layout"
import { GATE_VIEWPORTS } from "./matrix"

// Sub-pixel layout can round the document one pixel wider than the viewport without a scrollbar.
const OVERFLOW_SLACK_PX = 1

/**
 * Assert {@link scanBrowserAxe} finds nothing, failing with one actionable line per violation. A
 * throwing wrapper over the finding form the flow engine consumes, kept for the surface gate.
 */
export async function expectNoBrowserAxeViolations(
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
 * Assert the focused control shows a visible indicator of at least 2 CSS px (WCAG 2.4.7) and is not
 * entirely covered by other content (WCAG 2.4.11). Polls, because a component may mark its focus a
 * render after the focus event (a one-time-code input tracks the caret through `selectionchange`).
 */
export async function expectFocusVisible(page: Page): Promise<void> {
  await expect
    .poll(() => findFocusProblems(page), {
      message: "focused control shows a visible, unobscured focus indicator",
    })
    .toEqual([])
}

/**
 * Assert React has hydrated the page's `main` landmark. Server markup is visible before it
 * hydrates, so a check or screenshot can run too early. Playwright's screenshot then sets an inline
 * caret style that hydration reports as a mismatch, and a click does nothing. Skip it for a surface
 * that blocks the client bundle on purpose.
 */
export async function expectHydrated(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(countUnhydrated), {
      message: "the main landmark is hydrated",
    })
    .toBe(0)
}

/** Assert the page does not scroll horizontally at its current viewport. */
export async function expectNoHorizontalOverflow(
  page: Page,
  label: string = page.url(),
): Promise<void> {
  expect(await horizontalOverflow(page), `${label} overflows horizontally`).toBeLessThanOrEqual(
    OVERFLOW_SLACK_PX,
  )
}

/**
 * Assert the page reflows at the WCAG 1.4.10 target: a real 320 CSS px viewport, not CSS zoom, so
 * media and container queries collapse the way they would for a user at 400% zoom. The original
 * viewport is restored afterwards, so later assertions keep their own size.
 */
export async function expectReflowAtNarrowViewport(page: Page): Promise<void> {
  const original = page.viewportSize()
  try {
    await page.setViewportSize(GATE_VIEWPORTS.reflow)
    // Controls that resize with their container transition to the narrow layout; measure the end.
    await settleAnimations(page)
    await expectNoHorizontalOverflow(page, `${page.url()} at 320 CSS px (WCAG 1.4.10 reflow)`)
  } finally {
    if (original) {
      await page.setViewportSize(original)
    }
  }
}

/**
 * Assert every open dialog, alert dialog, and menu fits inside the viewport, so none of its content
 * is cut off where neither the overlay nor the scroll-locked page can reach it.
 */
export async function expectOverlaysInViewport(
  page: Page,
  label: string = page.url(),
): Promise<void> {
  const failures = await findOverlaysOutsideViewport(page)
  expect(failures, `${label} has an overlay outside the viewport`).toEqual([])
}
