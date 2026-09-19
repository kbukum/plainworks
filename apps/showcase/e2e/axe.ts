import AxeBuilder from "@axe-core/playwright"
import { expect, type Page } from "@playwright/test"

// The two WCAG rules the jsdom unit floor cannot measure and this browser gate owns.
// `color-contrast` (WCAG 1.4.3) needs real layout and canvas sampling; `target-size` (WCAG 2.5.8,
// 24x24 CSS px) needs real box geometry. `target-size` is an axe experimental rule, so naming it in
// `runOnly` is what enables it here.
const BROWSER_ONLY_RULES = ["color-contrast", "target-size"] as const

/**
 * Run axe-core in the live browser over the current page, scoped to the layout-dependent rules the
 * unit floor skips, and fail with actionable `rule: help — target` detail on any violation. Reuses
 * the same axe engine version the `@plainworks/testkit` floor pins, so the two gates speak one rule
 * vocabulary.
 */
export async function expectNoBrowserAxeViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .options({ runOnly: { type: "rule", values: [...BROWSER_ONLY_RULES] } })
    .analyze()

  if (violations.length === 0) {
    return
  }

  const detail = violations
    .map((violation) => {
      const targets = violation.nodes.map((node) => node.target.join(" ")).join(", ")
      return `${violation.id}: ${violation.help} — ${targets}`
    })
    .join("\n")
  expect(violations, `Expected no color-contrast or target-size violations:\n${detail}`).toEqual([])
}

// WCAG 1.4.10 reflow is defined at a viewport equivalent to 320 CSS px wide (1280px at 400% zoom).
// Media and container queries key off the real viewport width, which `element.style.zoom` does not
// shrink — so a layout that only overflows once responsive breakpoints collapse would slip past a
// zoom-only check. This narrows the actual viewport to the 320px reflow target instead.
const REFLOW_VIEWPORT = { width: 320, height: 512 } as const

/**
 * Assert the current page reflows at the WCAG 1.4.10 target viewport (320 CSS px wide) with no
 * horizontal scrolling. Narrowing the real Playwright viewport — not just CSS zoom — exercises the
 * page's responsive breakpoints, so a fluid, mobile-first layout must absorb the width without a
 * horizontal scrollbar or clipped content. Restores the original viewport in `finally` so later
 * assertions stay isolated at the configured desktop width.
 */
export async function expectReflowAtNarrowViewport(page: Page): Promise<void> {
  const original = page.viewportSize()
  try {
    await page.setViewportSize(REFLOW_VIEWPORT)
    // `scrollWidth` exceeding `clientWidth` is a horizontal scrollbar — the reflow failure WCAG
    // 1.4.10 forbids. Allow a 1px rounding slack.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(
      overflow,
      "content overflows horizontally at a 320 CSS px viewport (WCAG 1.4.10 reflow)",
    ).toBeLessThanOrEqual(1)
  } finally {
    if (original) {
      await page.setViewportSize(original)
    }
  }
}
