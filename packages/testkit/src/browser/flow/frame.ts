/**
 * How a screenshot frames its surface. A `viewport` capture shows the page as a user sees it,
 * fixed chrome included. A `full-page` capture shows every scrolled row, but Chromium keeps each
 * `position: fixed` element where it sat in the first viewport, so it lands mid-image. A full-page
 * capture names that chrome in `hideFixed` (CSS selectors), and the capture hides it.
 */
export type VisualCapture =
  | { readonly kind: "viewport" }
  | { readonly kind: "full-page"; readonly hideFixed: readonly string[] }

/** The Playwright screenshot options a {@link VisualCapture} maps to. */
export interface CaptureOptions {
  readonly fullPage: boolean
}

/** Map a surface's capture to screenshot options. An absent capture frames the viewport. */
export function captureOptions(capture: VisualCapture | undefined): CaptureOptions {
  return { fullPage: capture?.kind === "full-page" }
}

/** The page surface {@link withCaptureFrame} needs; a Playwright `Page` satisfies it. */
export interface CaptureFramePage {
  evaluate(scroll: () => void): Promise<unknown>
  addStyleTag(options: { content: string }): Promise<{
    evaluate(remove: (style: Node) => void): Promise<unknown>
  }>
}

/**
 * Run `capture` in the capture's canonical frame. A full page starts from the top, because Chromium
 * paints sticky chrome at the current scroll offset, and its fixed chrome is hidden until the
 * capture ends, even when it fails. A viewport capture is left exactly as the user sees it.
 */
export async function withCaptureFrame<T>(
  page: CaptureFramePage,
  capture: VisualCapture | undefined,
  run: () => Promise<T>,
): Promise<T> {
  if (capture?.kind !== "full-page") return run()
  await page.evaluate(() => window.scrollTo(0, 0))
  if (capture.hideFixed.length === 0) return run()
  const style = await page.addStyleTag({
    content: `${capture.hideFixed.join(", ")} { visibility: hidden !important; }`,
  })
  try {
    return await run()
  } finally {
    await style.evaluate((node) => node.parentNode?.removeChild(node))
  }
}
