import { expect, type Page } from "@playwright/test"
import { settleAnimations } from "./animation"
import { GATE_VIEWPORTS, type ViewportSize } from "./matrix"

// Sub-pixel layout can round the document one pixel wider than the viewport without a scrollbar.
const OVERFLOW_SLACK_PX = 1

/** How many CSS pixels the document is wider than the viewport: a horizontal scrollbar when > 1. */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
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

/** An open overlay's name and its box in viewport coordinates. */
export interface OverlayBox {
  readonly name: string
  readonly top: number
  readonly bottom: number
  readonly left: number
  readonly right: number
}

/**
 * Judge whether every open overlay fits its viewport. A dialog or menu is fixed to the viewport and
 * the page behind it cannot scroll, so any part outside the viewport is unreachable (WCAG 1.4.10).
 * Returns one message per overlay that crosses an edge by more than sub-pixel rounding.
 */
export function judgeOverlayContainment(
  overlays: readonly OverlayBox[],
  viewport: ViewportSize,
): string[] {
  const size = `${viewport.width}x${viewport.height}`
  return overlays.flatMap((box) => {
    const crossed = [
      [box.top < -OVERFLOW_SLACK_PX, -box.top, "above"],
      [box.bottom > viewport.height + OVERFLOW_SLACK_PX, box.bottom - viewport.height, "below"],
      [box.left < -OVERFLOW_SLACK_PX, -box.left, "left of"],
      [box.right > viewport.width + OVERFLOW_SLACK_PX, box.right - viewport.width, "right of"],
    ] as const
    const edges = crossed
      .filter(([over]) => over)
      .map(([, by, edge]) => `${Math.round(by)}px ${edge}`)
    return edges.length === 0
      ? []
      : [`${box.name}: extends ${edges.join(" and ")} the ${size} viewport`]
  })
}

/** Measure every open dialog, alert dialog, and menu. Runs in the browser. */
function measureOverlays(): OverlayBox[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      "[role='dialog'], [role='alertdialog'], [role='menu']",
    ),
  ]
    .map((element) => ({ element, box: element.getBoundingClientRect() }))
    .filter(({ box }) => box.width > 0 && box.height > 0)
    .map(({ element, box }) => ({
      name:
        element.getAttribute("aria-label") ||
        document
          .getElementById(element.getAttribute("aria-labelledby")?.split(" ")[0] ?? "")
          ?.textContent?.trim() ||
        element.getAttribute("role") ||
        "overlay",
      top: box.top,
      bottom: box.bottom,
      left: box.left,
      right: box.right,
    }))
}

/**
 * Assert every open dialog, alert dialog, and menu fits inside the viewport, so none of its content
 * is cut off where neither the overlay nor the scroll-locked page can reach it.
 */
export async function expectOverlaysInViewport(
  page: Page,
  label: string = page.url(),
): Promise<void> {
  const viewport = page.viewportSize()
  if (viewport === null) throw new Error("expectOverlaysInViewport needs a fixed viewport size")
  const failures = judgeOverlayContainment(await page.evaluate(measureOverlays), viewport)
  expect(failures, `${label} has an overlay outside the viewport`).toEqual([])
}
