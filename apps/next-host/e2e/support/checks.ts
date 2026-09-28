import {
  type BrowserAxeOptions,
  findFocusProblems,
  formatAxeViolations,
  scanBrowserAxe,
} from "@plainworks/testkit/browser"
import { expect, type Page } from "@playwright/test"

// Throwing assertions the functional specs use to check a single moment the flows do not reach,
// such as a menu opened mid-journey. Each is a thin layer over the public finding forms the flow
// engine also consumes, so there is one implementation of every check.

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
