import type { VisualCapture } from "@plainworks/testkit/browser"

/**
 * A whole page, every scrolled row. Flows run with the development inspector off, so the page docks
 * no fixed chrome for the capture to hide.
 */
export const PAGE_FRAME: VisualCapture = { kind: "full-page", hideFixed: [] }
