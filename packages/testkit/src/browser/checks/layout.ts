import type { Page } from "@playwright/test"

// Sub-pixel layout can round the document one pixel wider than the viewport without a scrollbar.
const OVERFLOW_SLACK_PX = 1

/** How many CSS pixels the document is wider than the viewport: a horizontal scrollbar when > 1. */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
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
  viewport: { readonly width: number; readonly height: number },
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

/** Describe every open dialog, alert dialog, and menu that crosses a viewport edge. */
export async function findOverlaysOutsideViewport(page: Page): Promise<string[]> {
  const viewport = page.viewportSize()
  if (viewport === null) throw new Error("Overlay containment needs a fixed viewport size")
  return judgeOverlayContainment(await page.evaluate(measureOverlays), viewport)
}
